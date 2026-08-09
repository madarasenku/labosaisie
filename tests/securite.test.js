// Sécurité côté serveur (v13.80).
//
// Ces contrôles portent sur ce que le CLIENT envoie et sur la façon dont il
// restitue le verdict du serveur. Ils ne remplacent pas l'audit exécuté dans
// la base (RPC auditer_securite) — voir la note en fin de tests/README.md.
//
// Ce qu'ils verrouillent concrètement :
//   • le compteur de dossiers n'est plus appelé sans jeton, ET la saisie
//     continue de fonctionner si le serveur le refuse ;
//   • le jeton de partage d'un résultat n'est jamais tiré de Math.random() ;
//   • l'audit affiche un échec comme un échec, pas comme un silence.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('SÉCURITÉ SERVEUR');

  // ── Le compteur de dossiers exige un jeton ─────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Compteur de dossiers');
    const appel = await page.evaluate(async () => {
      let capté = null;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_next_dossier_num') { capté = params; return { data: 42, error: null }; }
        return { data: [], error: null };
      };
      const num = await getNextDossierNum();
      return { capté, num };
    });
    r.check('un jeton accompagne la demande', !!appel.capté?.p_token, true);
    r.check('le mois reste transmis', typeof appel.capté?.p_month_year, 'string');
    r.check('le numéro du serveur est retenu', appel.num, 42);

    // Un poste resté sur une ancienne version reçoit une erreur : la saisie
    // ne doit pas se bloquer, sinon le durcissement casse le laboratoire.
    const repli = await page.evaluate(async () => {
      _sb.rpc = async (nom) => {
        if (nom === 'get_next_dossier_num')
          return { data: null, error: { message: 'function does not exist' } };
        return { data: [], error: null };
      };
      return await getNextDossierNum();
    });
    r.check('repli local si le serveur refuse', typeof repli === 'number' && repli > 0, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Le jeton de partage doit être imprévisible ─────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Jeton de partage des résultats');
    const res = await page.evaluate(() => {
      const vus = new Set();
      for (let i = 0; i < 500; i++) vus.add(genShareToken());
      // Sans crypto.randomUUID (vieux navigateur), le repli ne doit pas
      // retomber sur Math.random() : ce jeton est la seule chose qui protège
      // le résultat d'un patient depuis l'extérieur.
      const vraiUUID = crypto.randomUUID;
      crypto.randomUUID = undefined;
      let hasarde = false;
      const vraiRandom = Math.random;
      Math.random = () => { hasarde = true; return 0.5; };
      const replis = new Set();
      for (let i = 0; i < 200; i++) replis.add(genShareToken());
      Math.random = vraiRandom;
      crypto.randomUUID = vraiUUID;
      return { uniques: vus.size, longueur: [...vus][0].length,
               repliUniques: replis.size, repliLongueur: [...replis][0].length, hasarde };
    });
    r.check('500 jetons, 500 valeurs distinctes', res.uniques, 500);
    r.check('longueur constante', res.longueur, 32);
    r.check('repli sans Math.random()', res.hasarde, false);
    r.check('repli toujours unique', res.repliUniques, 200);
    r.check('repli de même longueur', res.repliLongueur, 32);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── L'audit doit crier quand ça va mal ─────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Restitution de l\'audit');

    await page.evaluate(() => {
      _sb.rpc = async () => ({ data: {
        fonctions_sans_controle_de_jeton: [], tables_sans_rls: [],
        comptes_a_hachage_faible: [], verifie_le: new Date().toISOString() }, error: null });
    });
    await page.evaluate(() => lancerAuditSecurite());
    await page.waitForTimeout(600);
    const sain = await page.evaluate(
      () => document.getElementById('audit-securite-resultat').textContent);
    r.check('tout vert quand tout va bien', (sain.match(/✓/g) || []).length, 3);
    r.check('aucune alerte parasite', /✗/.test(sain), false);

    await page.evaluate(() => {
      _sb.rpc = async () => ({ data: {
        fonctions_sans_controle_de_jeton: [{ fonction: 'supprimer_tout', ecrit: true }],
        tables_sans_rls: ['labo_secret'],
        comptes_a_hachage_faible: ['tom'],
        verifie_le: new Date().toISOString() }, error: null });
    });
    await page.evaluate(() => lancerAuditSecurite());
    await page.waitForTimeout(600);
    const casse = await page.evaluate(
      () => document.getElementById('audit-securite-resultat').textContent);
    r.check('les trois problèmes sont signalés', (casse.match(/✗/g) || []).length, 3);
    r.check('la fonction fautive est nommée', /supprimer_tout/.test(casse), true);
    // Une fonction non protégée qui ÉCRIT n'a pas la même gravité qu'une
    // lecture : l'admin doit le voir sans lire le code.
    r.check('l\'écriture est signalée comme telle', /écrit/.test(casse), true);
    r.check('la table sans RLS est nommée', /labo_secret/.test(casse), true);
    r.check('le compte faible est nommé', /tom/.test(casse), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Cloisonnement ──────────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Audit réservé aux administrateurs');
    const res = await page.evaluate(async () => {
      let appels = 0;
      _sb.rpc = async () => { appels++; return { data: {}, error: null }; };
      let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
      await lancerAuditSecurite();
      window.toast = vrai;
      return { capté, appels };
    });
    r.check('refus signalé', /administrateur/i.test(res.capté), true);
    r.check('aucun appel au serveur', res.appels, 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

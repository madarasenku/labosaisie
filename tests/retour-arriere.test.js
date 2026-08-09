// Retour arrière depuis les instantanés nocturnes (v13.79).
//
// Le serveur photographie la base chaque nuit à 23h et garde 15 jours. Ce
// filet existait depuis longtemps mais n'était exposé nulle part : personne
// ne pouvait tomber dedans. Ces contrôles vérifient qu'il est désormais
// accessible ET qu'il ne peut pas se retourner contre l'utilisateur.
//
// Deux gestes de risque très différents, testés séparément :
//   • remettre les fiches DISPARUES d'une journée → purement additif ;
//   • réparer UNE fiche abîmée → écrase vraiment, donc une seule à la fois.
const { serve, openApp, createReporter } = require('./helpers');

// Dates relatives : voir tests/README.md. Une suite qui rougit toute seule
// finit par être ignorée.
const jourMoins = n => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const HIER = jourMoins(1), AVANT_HIER = jourMoins(2);

const INSTANTANES = { instantanes: [
  { date: HIER,       nb_fiches: 635, disparues: 0 },
  { date: AVANT_HIER, nb_fiches: 630, disparues: 4 },
]};

// Espionne les appels serveur et accepte les confirmations.
// `_sb` est déclaré avec `let` : il n'existe pas sur window.
const espionner = (page, reponses) => page.evaluate((rep) => {
  window.__appels = [];
  _sb.rpc = async (nom, params) => {
    window.__appels.push({ nom, params });
    return { data: (nom in rep) ? rep[nom] : [], error: null };
  };
  window.showConfirmModal = async () => true;
}, reponses);

(async () => {
  const srv = await serve();
  const r = createReporter('RETOUR ARRIÈRE (INSTANTANÉS NOCTURNES)');

  // ── La liste des dates ─────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Choix de la date');
    await espionner(page, { liste_instantanes: INSTANTANES });
    await page.evaluate(() => chargerInstantanes());
    await page.waitForTimeout(600);

    const options = await page.evaluate(() => [...document.querySelectorAll('#instantane-date option')]
      .map(o => ({ v: o.value, t: o.textContent })));
    r.check('une ligne par instantané', options.length, 3);   // + « choisir une date »
    r.check('la plus récente en premier', options[1].v, HIER);
    r.check('nombre de fiches annoncé', /635 fiches/.test(options[1].t), true);
    // Repérer la bonne date sans tâtonner : le compte de fiches manquantes
    // doit être visible dès la liste déroulante.
    r.check('fiches disparues signalées dans la liste',
            /4 fiche\(s\) disparue\(s\)/.test(options[2].t), true);
    r.check('aucun compteur parasite sur une journée saine',
            /disparue/.test(options[1].t), false);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── L'analyse annonce exactement ce qui va se passer ───────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Analyse avant toute écriture');
    await espionner(page, {
      liste_instantanes: INSTANTANES,
      comparer_instantane: { date: AVANT_HIER, nb_fiches: 630, disparues: 2,
        modifiees: 3, creees_depuis: 11,
        apercu: [
          { id: 501, dossier: '0099-0826', nom: 'LOUA NATHAN', montant: 3500, cree_par: 'nadia' },
          { id: 502, dossier: '0100-0826', nom: 'KOUAME AYA',  montant: 4000, cree_par: 'agent1' },
        ] },
    });
    await page.evaluate(() => chargerInstantanes());
    await page.waitForTimeout(400);
    await page.evaluate((d) => {
      document.getElementById('instantane-date').value = d;
      analyserInstantane();
    }, AVANT_HIER);
    await page.waitForTimeout(700);

    const txt = await page.evaluate(
      () => document.getElementById('instantane-resultat').textContent);
    r.check('fiches manquantes annoncées', /2 ne sont plus en base/.test(txt), true);
    // Un compteur ne suffit pas : l'admin doit reconnaître ce qu'il remet.
    r.check('les patients sont nommés', /LOUA NATHAN/.test(txt) && /KOUAME AYA/.test(txt), true);
    r.check('numéro de dossier affiché', /0099-0826/.test(txt), true);
    r.check('fiches récentes annoncées conservées', /11 fiche\(s\) créée\(s\) depuis/.test(txt), true);
    r.check('fiches modifiées annoncées intouchées', /3 fiche\(s\) modifiée\(s\)/.test(txt), true);
    r.check('bouton proposé', await page.evaluate(
      () => document.getElementById('btn-retour-arriere').style.display !== 'none'), true);
    r.check('bouton chiffré', await page.evaluate(
      () => document.getElementById('btn-retour-arriere').textContent), '♻️ Remettre les 2 fiche(s) disparue(s)');
    // Analyser ne doit RIEN écrire.
    r.check('aucune écriture pendant l\'analyse', await page.evaluate(
      () => window.__appels.filter(a => a.nom.startsWith('restaurer_')).length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Journée saine : aucun bouton, aucune tentation ─────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Journée sans perte');
    await espionner(page, { liste_instantanes: INSTANTANES,
      comparer_instantane: { date: HIER, nb_fiches: 635, disparues: 0,
                             modifiees: 0, creees_depuis: 2, apercu: [] } });
    await page.evaluate(() => chargerInstantanes());
    await page.waitForTimeout(400);
    await page.evaluate((d) => {
      document.getElementById('instantane-date').value = d; analyserInstantane();
    }, HIER);
    await page.waitForTimeout(700);
    const txt = await page.evaluate(
      () => document.getElementById('instantane-resultat').textContent);
    r.check('rien à remettre est dit clairement', /Aucune fiche manquante/.test(txt), true);
    r.check('aucun bouton de restauration', await page.evaluate(
      () => document.getElementById('btn-retour-arriere').style.display), 'none');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── La restauration de masse ───────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Remise en place des fiches disparues');
    await espionner(page, {
      liste_instantanes: INSTANTANES,
      comparer_instantane: { date: AVANT_HIER, nb_fiches: 630, disparues: 4,
                             modifiees: 0, creees_depuis: 0, apercu: [] },
      restaurer_depuis_instantane: { date: AVANT_HIER, restaurees: 4, sans_prescripteur: 1 },
    });
    await page.evaluate(() => chargerInstantanes());
    await page.waitForTimeout(400);
    await page.evaluate((d) => {
      document.getElementById('instantane-date').value = d; analyserInstantane();
    }, AVANT_HIER);
    await page.waitForTimeout(600);
    await page.evaluate(() => lancerRetourArriere());
    await page.waitForTimeout(900);

    const appels = await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'restaurer_depuis_instantane'));
    r.check('un seul appel de restauration', appels.length, 1);
    r.check('sur la date choisie', appels[0] && appels[0].params.p_date, AVANT_HIER);
    // Un retour arrière est purement additif. On nomme les RPC destructrices
    // plutôt que de filtrer sur un motif : « get_deleted_status » contient
    // « delete » et faisait passer ce contrôle pour bon à tort.
    r.check('aucune RPC destructrice appelée', await page.evaluate(() => {
      const interdites = ['delete_resultat_admin', 'clear_resultats_admin',
                          'soft_delete_dossier', 'purge_audit_log',
                          'delete_analyse_from_dossier', 'delete_user_admin'];
      return window.__appels.filter(a => interdites.includes(a.nom)).length;
    }), 0);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Rien ne part sans confirmation ─────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Confirmation obligatoire');
    await page.evaluate((d) => {
      window.__appels = [];
      _sb.rpc = async (nom, params) => {
        window.__appels.push({ nom, params });
        if (nom === 'liste_instantanes') return { data: { instantanes: [] }, error: null };
        if (nom === 'comparer_instantane')
          return { data: { date: d, nb_fiches: 10, disparues: 3, modifiees: 0,
                           creees_depuis: 0, apercu: [] }, error: null };
        return { data: {}, error: null };
      };
      window.showConfirmModal = async () => false;      // l'admin annule
      document.getElementById('instantane-date').innerHTML = '<option value="' + d + '">x</option>';
      document.getElementById('instantane-date').value = d;
      return analyserInstantane();
    }, AVANT_HIER);
    await page.waitForTimeout(700);
    await page.evaluate(() => lancerRetourArriere());
    await page.waitForTimeout(700);
    r.check('annulation → aucune écriture', await page.evaluate(
      () => window.__appels.filter(a => a.nom.startsWith('restaurer_')).length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Réparation d'une fiche : le geste qui écrase ───────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Réparation d\'une fiche précise');
    await espionner(page, {
      restaurer_fiche_depuis_instantane: { ok: true, dossier: 'D203', nom: 'TRAORE MOUSSA' },
    });
    await page.evaluate((d) => {
      document.getElementById('instantane-date').innerHTML = '<option value="' + d + '">x</option>';
      document.getElementById('instantane-date').value = d;
    }, AVANT_HIER);

    // Le jeu de données de helpers.js contient le dossier D203.
    await page.evaluate(() => { document.getElementById('reparer-dossier').value = 'D203'; });
    await page.evaluate(() => reparerFicheParDossier());
    await page.waitForTimeout(800);
    const app = await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'restaurer_fiche_depuis_instantane'));
    r.check('la fiche est envoyée', app.length, 1);
    // Le numéro de dossier saisi doit être traduit en identifiant technique :
    // envoyer « D203 » au serveur ne réparerait rien, en silence.
    r.check('numéro de dossier traduit en identifiant', app[0] && app[0].params.p_id, 203);
    r.check('à la date choisie', app[0] && app[0].params.p_date, AVANT_HIER);

    // Un dossier inconnu ne doit rien envoyer du tout.
    await espionner(page, { restaurer_fiche_depuis_instantane: { ok: true } });
    await page.evaluate((d) => {
      document.getElementById('instantane-date').innerHTML = '<option value="' + d + '">x</option>';
      document.getElementById('instantane-date').value = d;
      document.getElementById('reparer-dossier').value = 'DOSSIER-QUI-N-EXISTE-PAS';
    }, AVANT_HIER);
    const msg = await page.evaluate(async () => {
      let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
      await reparerFicheParDossier();
      window.toast = vrai; return capté;
    });
    r.check('dossier inconnu refusé', /introuvable/i.test(msg), true);
    r.check('et aucun appel serveur', await page.evaluate(
      () => window.__appels.filter(a => a.nom.startsWith('restaurer_')).length), 0);
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
    r.section('Retour arrière réservé aux administrateurs');
    const res = await page.evaluate(async () => {
      window.__appels = [];
      _sb.rpc = async (nom, params) => { window.__appels.push({ nom, params }); return { data: {}, error: null }; };
      window.showConfirmModal = async () => true;
      const vrai = window.toast;
      let parMasse = ''; window.toast = m => { parMasse = m; };
      await lancerRetourArriere();
      let parFiche = ''; window.toast = m => { parFiche = m; };
      await reparerFicheDepuisInstantane(1, '2026-08-01');
      window.toast = vrai;
      return { parMasse, parFiche, appels: window.__appels.length };
    });
    r.check('retour arrière de masse refusé', /administrateur/i.test(res.parMasse), true);
    r.check('réparation de fiche refusée', /administrateur/i.test(res.parFiche), true);
    r.check('aucun appel au serveur', res.appels, 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

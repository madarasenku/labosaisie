// Actions groupées (v13.81).
//
// Point de départ : une mesure, pas une intuition. Le journal d'audit de
// production montrait 966 appels serveur pour 483 fiches — exactement deux
// par fiche, attendus l'un après l'autre, chacun suivi d'un réaffichage
// complet de l'historique. La cause : bulkSetStatut appelait la RPC, puis
// setStatut la rappelait.
//
// Ces contrôles verrouillent le comportement corrigé : UN appel pour tout
// le lot, et surtout le respect de ce que le serveur a réellement accepté.
const { serve, openApp, createReporter, FICHES, rows } = require('./helpers');

// L'espion doit continuer à servir get_resultats_light : un rafraîchissement
// déclenché en arrière-plan viderait sinon le cache local, et les contrôles
// « le cache suit » passeraient pour faux alors que le code est correct.
const espionner = (page, reponses) => page.evaluate(([rep, fiches]) => {
  window.__appels = [];
  _sb.rpc = async (nom, params) => {
    window.__appels.push({ nom, params });
    if (nom in rep) return { data: rep[nom], error: null };
    if (nom === 'get_resultats_light') return { data: fiches, error: null };
    return { data: [], error: null };
  };
  window.showConfirmModal = async () => true;
}, [reponses, rows()]);

const selectionner = (page, ids) => page.evaluate((liste) => {
  _selectedIds = new Set(liste);
}, ids);

(async () => {
  const srv = await serve();
  const r = createReporter('ACTIONS GROUPÉES');
  const IDS = FICHES.slice(0, 6).map(f => f[0]);

  // ── Statut : un seul appel pour tout le lot ────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Changement de statut groupé');
    await espionner(page, { set_statut_lot: { modifiees: 6, refusees: 0 } });
    await selectionner(page, IDS);
    // « urgent » et non « rendu » : la fiche 101 du jeu d'essai est DÉJÀ
    // « rendu », et un contrôle qui attend la valeur de départ passe au vert
    // même quand le code n'écrit rien du tout.
    const avant = await page.evaluate((id) =>
      ((_dbCache || []).find(r => r.id === id) || {}).patient?.statut, IDS[0]);
    r.check('état de départ différent de la cible', avant !== 'urgent', true);

    await page.evaluate(() => bulkSetStatut('urgent'));
    await page.waitForTimeout(900);

    const appels = await page.evaluate(() => window.__appels);
    const lot = appels.filter(a => a.nom === 'set_statut_lot');
    r.check('un seul appel serveur', lot.length, 1);
    r.check('les 6 fiches y sont', lot[0] && lot[0].params.p_ids.length, 6);
    r.check('le statut est transmis', lot[0] && lot[0].params.p_statut, 'urgent');
    // La régression exacte qu'on corrige : plus aucun appel unitaire.
    r.check('aucun appel unitaire résiduel',
            appels.filter(a => a.nom === 'set_dossier_statut').length, 0);
    r.check('le cache local suit', await page.evaluate((id) => {
      const x = (_dbCache || []).find(r => r.id === id);
      return x && x.patient.statut;
    }, IDS[0]), 'urgent');
    r.check('toutes les fiches du lot, pas seulement la première',
            await page.evaluate((liste) => liste.every(id =>
              ((_dbCache || []).find(r => r.id === id) || {}).patient?.statut === 'urgent'), IDS), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Le serveur fait foi ────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Ce que le serveur refuse ne s\'affiche pas');
    // Un agent sélectionne des fiches qui ne sont pas les siennes : le
    // serveur en refuse une partie. Afficher « rendu » sur une fiche que la
    // base a refusée serait pire que de ne rien afficher — le personnel
    // croirait le résultat transmis.
    await espionner(page, { set_statut_lot: { modifiees: 2, refusees: 4 } });
    await selectionner(page, IDS);
    await page.evaluate(() => bulkSetStatut('rendu'));
    await page.waitForTimeout(900);
    r.check('rechargement demandé au serveur', await page.evaluate(
      () => window.__appels.some(a => a.nom === 'get_resultats_light')), true);
    r.check('refus annoncés à l\'utilisateur', await page.evaluate(
      () => document.body.textContent.includes('4 refusée')), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Un échec serveur ne doit pas mentir à l'utilisateur ────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Échec serveur');
    await page.evaluate(() => {
      window.__appels = [];
      _sb.rpc = async (nom, params) => {
        window.__appels.push({ nom, params });
        if (nom === 'set_statut_lot') return { data: null, error: { message: 'réseau coupé' } };
        return { data: [], error: null };
      };
      window.showConfirmModal = async () => true;
    });
    await selectionner(page, IDS);
    const avant = await page.evaluate((id) =>
      ((_dbCache || []).find(r => r.id === id) || {}).patient?.statut, IDS[0]);
    const msg = await page.evaluate(async () => {
      let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
      await bulkSetStatut('rendu');
      window.toast = vrai; return capté;
    });
    const apres = await page.evaluate((id) =>
      ((_dbCache || []).find(r => r.id === id) || {}).patient?.statut, IDS[0]);
    r.check('l\'échec est annoncé', /échec/i.test(msg), true);
    r.check('le cache n\'a pas été modifié à tort', apres, avant);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Encaissement groupé ────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Encaissement groupé');
    await espionner(page, { encaisser_lot: { encaissees: 5, total: 25000, ignorees: 1 } });
    await selectionner(page, IDS);
    await page.evaluate(() => bulkEncaisser());
    await page.waitForTimeout(1000);
    const appels = await page.evaluate(() => window.__appels);
    r.check('un seul appel d\'encaissement',
            appels.filter(a => a.nom === 'encaisser_lot').length, 1);
    // L'ancienne version écrivait fiche par fiche via update_dossier_patient :
    // une coupure au milieu laissait la caisse à moitié encaissée.
    r.check('aucune écriture fiche par fiche',
            appels.filter(a => a.nom === 'update_dossier_patient').length, 0);
    const txt = await page.evaluate(() => document.body.textContent);
    // Un dossier déjà payé n'est pas une erreur, mais l'écart entre le
    // nombre annoncé et le nombre encaissé doit être expliqué.
    r.check('les dossiers déjà payés sont expliqués', /déjà payé/.test(txt), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Cloisonnement ──────────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'spectateur', username: 'obs', userId: 5,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Un spectateur ne modifie rien');
    await espionner(page, { set_statut_lot: { modifiees: 6, refusees: 0 },
                            encaisser_lot: { encaissees: 6, total: 1 } });
    await selectionner(page, IDS);
    await page.evaluate(() => bulkSetStatut('rendu'));
    await page.evaluate(() => bulkEncaisser());
    await page.waitForTimeout(800);
    r.check('aucune écriture déclenchée', await page.evaluate(
      () => window.__appels.filter(a => /set_statut_lot|encaisser_lot/.test(a.nom)).length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

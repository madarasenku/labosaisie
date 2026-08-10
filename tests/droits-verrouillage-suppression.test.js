// Nouvelles règles de droits (v13.82).
//
// Décidées après une constatation dans les données : les 106 dossiers
// impayés du laboratoire (607 500 FCFA) étaient TOUS verrouillés. Un dossier
// masqué disparaît aussi de l'écran « À encaisser » — le caissier ne peut
// donc pas encaisser ce qu'il ne voit pas. Le verrouillage engage trop pour
// rester ouvert à tous.
//
//   • verrouiller / déverrouiller → administrateur uniquement ;
//   • supprimer (corbeille)       → tout le monde, sur n'importe quel
//     dossier, mais tracé nominativement et réversible ;
//   • suppression DÉFINITIVE      → administrateur uniquement, inchangée ;
//   • spectateur                  → lecture seule, inchangé.
const { serve, openApp, createReporter, rows } = require('./helpers');

const preparer = (page) => page.evaluate((fiches) => {
  window.__appels = [];
  _sb.rpc = async (nom, params) => {
    window.__appels.push({ nom, params });
    if (nom === 'get_resultats_light') return { data: fiches, error: null };
    if (nom === 'soft_delete_dossier') return { data: 'ok', error: null };
    if (nom === 'toggle_restriction')  return { data: 'restricted', error: null };
    return { data: [], error: null };
  };
  window.showConfirmModal = async () => true;
}, rows());

// Le jeu d'essai : 101 appartient à agent1, 102 aussi, 104 à agent2.
const A_MOI = 101, A_UN_AUTRE = 104;

(async () => {
  const srv = await serve();
  const r = createReporter('DROITS — VERROUILLAGE ET SUPPRESSION');

  // ── Un agent peut supprimer le dossier d'un collègue ───────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Suppression ouverte à tous');
    await preparer(page);
    await page.evaluate((id) => softDeleteDossier(id), A_UN_AUTRE);
    await page.waitForTimeout(800);
    const appels = await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'soft_delete_dossier'));
    r.check('la suppression part au serveur', appels.length, 1);
    r.check('sur le bon dossier', appels[0] && appels[0].params.p_id, A_UN_AUTRE);

    // Et sur son propre dossier, évidemment.
    await preparer(page);
    await page.evaluate((id) => softDeleteDossier(id), A_MOI);
    await page.waitForTimeout(700);
    r.check('son propre dossier aussi', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'soft_delete_dossier').length), 1);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Mais il ne peut plus verrouiller ───────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Verrouillage réservé à l\'administrateur');
    await preparer(page);
    const msg = await page.evaluate(async (id) => {
      let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
      await toggleRestriction(id);
      window.toast = vrai; return capté;
    }, A_MOI);
    r.check('refus signalé', /administrateur/i.test(msg), true);
    // Même sur SA PROPRE fiche : c'était justement le cas autorisé avant.
    r.check('aucun appel au serveur', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'toggle_restriction').length), 0);

    await page.evaluate(() => { _selectedIds = new Set([101, 102]); });
    await page.evaluate(() => bulkLock());
    await page.evaluate(() => bulkUnlock());
    await page.waitForTimeout(700);
    r.check('verrouillage groupé bloqué aussi', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'toggle_restriction').length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Les boutons disparaissent au lieu de dire non ──────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Ce qui est interdit ne s\'affiche pas');
    // Il faut ouvrir l'Historique ET élargir la période : sans cela le tableau
    // est vide et un contrôle « aucun bouton interdit » passerait au vert
    // simplement parce qu'il n'y a aucune ligne du tout.
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(800);
    const lignes = await page.evaluate(() => {
      const b = document.getElementById('history-body');
      return b ? [...b.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length > 1).length : 0;
    });
    r.check('des lignes sont bien affichées', lignes > 0, true);

    const vu = await page.evaluate(() => {
      _selectedIds = new Set([101]);
      updateBulkToolbar();
      return {
        cadenas: document.querySelectorAll('[id^="lock-btn-"]').length,
        lot:     document.getElementById('bulk-lock-btn')?.style.display,
        lotDe:   document.getElementById('bulk-unlock-btn')?.style.display,
        // La corbeille, elle, doit rester proposée à tout le monde.
        poubelles: [...document.querySelectorAll('button')]
                     .filter(b => /softDeleteDossier/.test(b.getAttribute('onclick') || '')).length,
      };
    });
    r.check('aucun cadenas sur les lignes', vu.cadenas, 0);
    r.check('bouton de verrouillage groupé masqué', vu.lot, 'none');
    r.check('bouton de déverrouillage groupé masqué', vu.lotDe, 'none');
    r.check('la corbeille reste proposée', vu.poubelles > 0, true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── L'administrateur garde les deux ────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('L\'administrateur conserve tous les droits');
    await preparer(page);
    await page.evaluate((id) => toggleRestriction(id), A_UN_AUTRE);
    await page.waitForTimeout(800);
    r.check('verrouillage autorisé', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'toggle_restriction').length), 1);
    const vu = await page.evaluate(() => {
      _selectedIds = new Set([101]); updateBulkToolbar();
      return { lot: document.getElementById('bulk-lock-btn')?.style.display,
               suppr: document.getElementById('bulk-delete-btn')?.style.display };
    });
    r.check('bouton de verrouillage groupé visible', vu.lot !== 'none', true);
    r.check('suppression définitive visible', vu.suppr !== 'none', true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Le caissier aussi : « chacun » veut dire chacun ────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'caissier', username: 'caisse1', userId: 6,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Le caissier peut supprimer lui aussi');
    await preparer(page);
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(800);
    // Le caissier était exclu du bloc d'actions avec la duplication : la
    // corbeille en a été sortie exprès, sinon « chacun » l'oubliait.
    r.check('la corbeille lui est proposée', await page.evaluate(
      () => [...document.querySelectorAll('button')]
              .filter(b => /softDeleteDossier/.test(b.getAttribute('onclick') || '')).length) > 0, true);
    await page.evaluate((id) => softDeleteDossier(id), A_MOI);
    await page.waitForTimeout(700);
    r.check('la suppression part au serveur', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'soft_delete_dossier').length), 1);
    r.check('mais aucun cadenas', await page.evaluate(
      () => document.querySelectorAll('[id^="lock-btn-"]').length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Le spectateur ne touche toujours à rien ────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'spectateur', username: 'obs', userId: 5,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Le spectateur reste en lecture seule');
    await preparer(page);
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(800);
    r.check('des lignes sont bien affichées', await page.evaluate(() => {
      const b = document.getElementById('history-body');
      return b ? [...b.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length > 1).length : 0;
    }) > 0, true);
    await page.evaluate((id) => softDeleteDossier(id), A_MOI);
    await page.evaluate((id) => toggleRestriction(id), A_MOI);
    await page.waitForTimeout(800);
    r.check('aucune écriture', await page.evaluate(
      () => window.__appels.filter(a => /soft_delete_dossier|toggle_restriction/.test(a.nom)).length), 0);
    r.check('aucun bouton de suppression', await page.evaluate(
      () => [...document.querySelectorAll('button')]
              .filter(b => /softDeleteDossier/.test(b.getAttribute('onclick') || '')).length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

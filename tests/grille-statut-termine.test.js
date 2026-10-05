// ✅ v13.227 — BUG : compléter les résultats via la GRILLE (saisie en série —
// le chemin « Saisir / modifier les résultats » depuis la liste) n'passait PAS
// le dossier en « Terminé », contrairement au mode « page unique ». On vérifie
// qu'un dossier dont tous les examens de la grille sont remplis est marqué
// « rendu » (Terminé) automatiquement à l'enregistrement du lot.
const { serve, openApp, createReporter } = require('./helpers');

const mkDoss = (id, nom) => ({
  id, type: 'Dossier', montant: 3500, created_at: '2026-08-20T09:00:00Z',
  patient: { nom, dossier: '0' + id + '-0826', sexe: 'F', age: 33, statut: 'attente' },
  resultats: { _types: ['Immuno-Sérologie'], _facture_seule: true,
    _examens_coches: { 'Immuno-Sérologie': ['CRP — Protéine C-réactive'] },
    _examens_prix: { 'Immuno-Sérologie': { 'CRP — Protéine C-réactive': 3500 } },
    _montants: { 'Immuno-Sérologie': 3500 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });

const DOSSIERS = [mkDoss(801, 'CRP TERMINE')];

(async () => {
  const r = createReporter('GRILLE — STATUT « TERMINÉ » AUTOMATIQUE');
  const srv = await serve(8277);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8277 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((dossiers) => {
      window.__statutCalls = [];
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: dossiers, error: null };
        if (nom === 'get_resultat_full') { const d = dossiers.find(x => x.id === params.p_id); return { data: [{ resultats: d ? d.resultats : {} }], error: null }; }
        if (nom === 'update_resultat') return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: '2026-08-20T10:00:00Z', created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null };
        if (nom === 'set_dossier_statut') { window.__statutCalls.push(params); const d = dossiers.find(x => x.id === params.p_id); if (d) d.patient = Object.assign({}, d.patient, { statut: params.p_statut }); return { data: 'ok', error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, DOSSIERS);

    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(400);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);

    r.section('Avant : dossier « En attente »');
    r.check('statut de départ', await page.evaluate(() => getStatut(801)), 'attente');

    r.section('Compléter la CRP dans la grille puis enregistrer');
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('crp'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const a = document.getElementById('g_801_crp_crp'); a.value = '12'; a.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(200);
    const rowComplete = await page.evaluate(() => grilleRowComplete('801'));
    r.check('ligne reconnue complète', rowComplete, true);

    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(900);

    r.section('Après : passage automatique en « Terminé »');
    const statutCall = await page.evaluate(() => (window.__statutCalls.find(c => c.p_id === 801) || {}).p_statut);
    r.check('set_dossier_statut = rendu émis', statutCall, 'rendu');
    r.check('getStatut = rendu', await page.evaluate(() => getStatut(801)), 'rendu');
    r.check('badge = 🟢 Terminé', await page.evaluate(() => /🟢 Terminé/.test(statutBadge(801))), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
})();

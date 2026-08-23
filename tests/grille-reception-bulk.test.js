// ✅ v13.125 — Action groupée « réception seule » depuis l'historique.
const { serve, openApp, createReporter } = require('./helpers');

const TODAY = new Date().toISOString().slice(0, 10);
const mk = (id, nom) => ({
  id, type: 'Dossier', montant: 3000, created_at: TODAY + 'T09:00:00Z',
  patient: { nom, dossier: '0' + id + '-0826', sexe: 'F', age: 30, date: TODAY },
  resultats: { _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });

const DOSS = [mk(970, 'PATIENT UN'), mk(971, 'PATIENT DEUX')];

(async () => {
  const r = createReporter('GRILLE — ACTION GROUPÉE RÉCEPTION SEULE');
  const srv = await serve(8118);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8118 });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate((d) => {
      window.__calls = []; window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: d, error: null };
        if (nom === 'set_reception_seule') { window.__calls.push(params); return { data: { modifies: (params.p_ids || []).length }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, DOSS);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    r.section('Avant : les 2 sont en attente aujourd\'hui');
    await page.evaluate((t) => { _grilleDate = t; _grilleInclureReception = false; }, TODAY);
    r.check('2 patients en attente NFS', await page.evaluate(() => grillePending('nfs').map(x => x.id).length), 2);

    r.section('Marquer « réception seule » en groupe');
    await page.evaluate(() => { showView('historique'); _selectedIds = new Set([970, 971]); });
    await page.evaluate(() => window.bulkReceptionSeule(true));
    await page.waitForTimeout(600);
    const call = await page.evaluate(() => window.__calls[0]);
    r.check('RPC set_reception_seule appelé', !!call, true);
    r.check('valeur = true', call && call.p_value, true);
    r.check('sur les 2 dossiers', call && call.p_ids.slice().sort().join(','), '970,971');
    r.check('cache marqué réception seule', await page.evaluate(() => _dbCache.filter(x => (x.id === 970 || x.id === 971) && x.resultats._reception_seule).length), 2);

    r.section('Après : plus en attente dans la série (aujourd\'hui)');
    await page.evaluate((t) => { _grilleDate = t; _grilleInclureReception = false; }, TODAY);
    r.check('0 patient en attente (exclus)', await page.evaluate(() => grillePending('nfs').length), 0);
    await page.evaluate(() => { _grilleInclureReception = true; });
    r.check('réapparaissent si on inclut réception seule', await page.evaluate(() => grillePending('nfs').length), 2);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

// Accès brut au cache pour le test (getDB filtre selon le rôle/corbeille).

// ✅ v13.150 — Saisie en série : TP / TCA (coagulation) étaient absents de la
// grille (signalé). On vérifie qu'ils apparaissent, se saisissent et
// s'enregistrent (clés 'TP / INR' et 'TCA').
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 950, type: 'Dossier', montant: 6000, created_at: '2026-09-06T09:00:00Z',
  patient: { nom: 'COAG SERIE', dossier: '0950-0906', sexe: 'F', age: 34 },
  resultats: { _types: ['Biochimie'], _facture_seule: true,
    _examens_coches: { 'Biochimie': ['TP / INR', 'TCA'] },
    _examens_prix: { 'Biochimie': { 'TP / INR': 3000, 'TCA': 3000 } },
    _montants: { 'Biochimie': 6000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null };

(async () => {
  const r = createReporter('GRILLE — COAGULATION TP / TCA');
  const srv = await serve(8151);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8151 });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate((d) => {
      window.__u = []; window.showConfirmModal = async () => true;
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: [light(d)], error: null };
        if (nom === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);

    r.section('Présence de la coagulation dans la grille');
    r.check('entrée coag au registre', await page.evaluate(() => !!(GRILLE_EXAMS && GRILLE_EXAMS.coag)), true);
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('coag'); });
    await page.waitForTimeout(200);
    r.check('dossier coag en attente', await page.evaluate(() => grillePending('coag').length), 1);
    r.check('cellule TP présente', await page.evaluate(() => !!document.getElementById('g_950_coag_tp')), true);
    r.check('cellule TCA présente', await page.evaluate(() => !!document.getElementById('g_950_coag_tca')), true);

    r.section('Saisie et enregistrement');
    await page.evaluate(() => {
      const num = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      num('g_950_coag_tp', '82'); num('g_950_coag_tca', '32');
      const cb = document.getElementById('gsel_950'); if (cb) { cb.checked = true; grilleSelToggle(950); }
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => {
      const p = window.__u.find(u => u.p_id === 950); const b = p && p.p_resultats['Biochimie'];
      return { tp: b && b['TP / INR'] && b['TP / INR'].valeur, tca: b && b['TCA'] && b['TCA'].valeur };
    });
    r.check('TP enregistré = 82', saved.tp, '82');
    r.check('TCA enregistré = 32', saved.tca, '32');

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

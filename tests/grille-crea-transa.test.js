// ✅ v13.123 — Grille en série : créatinine (+ urée auto = créat/44.4),
// transaminases (ASAT/ALAT), et suppression de TSH + Urée du sélecteur.
const { serve, openApp, createReporter } = require('./helpers');

const mk = (id, nom, coches) => ({
  id, type: 'Dossier', montant: 5000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom, dossier: '0' + id + '-0826', sexe: 'M', age: 40 },
  resultats: { _types: ['Biochimie'], _facture_seule: true,
    _examens_coches: { 'Biochimie': coches },
    _examens_prix: { 'Biochimie': coches.reduce((o, l) => (o[l] = 2000, o), {}) },
    _montants: { 'Biochimie': 5000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });

const DOSS = [
  mk(910, 'CREAT PATIENT', ['Créatinine']),
  mk(911, 'TRANSA PATIENT', ['ASAT / ALAT (Transaminases)']),
];

(async () => {
  const r = createReporter('GRILLE — CRÉAT(+URÉE) & TRANSAMINASES');
  const srv = await serve(8115);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8115 });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate((d) => {
      window.__u = []; window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: d, error: null };
        if (nom === 'get_resultat_full') { const x = d.find(z => z.id === params.p_id); return { data: { resultats: x ? x.resultats : {} }, error: null }; }
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'a', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, DOSS);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);

    r.section('Sélecteur : TSH et Urée retirés');
    const opts = await page.evaluate(() => { window.ouvrirGrille('crea'); return [...document.getElementById('grille-exam-sel').options].map(o => o.value); });
    r.check('pas de TSH', opts.includes('tsh'), false);
    r.check('pas d\'Urée seule', opts.includes('uree'), false);
    r.check('créatinine présente', opts.includes('crea'), true);
    r.check('transaminases présentes', opts.includes('transa'), true);

    r.section('Créatinine → urée = créat / 44.4');
    await page.waitForTimeout(200);
    await page.evaluate(() => { const el = document.getElementById('g_910_crea'); el.value = '9.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const creaRes = await page.evaluate(() => {
      const p = window.__u.find(u => u.p_id === 910);
      const b = p && p.p_resultats['Biochimie'];
      return { crea: b && b['Créatinine'] && b['Créatinine'].valeur, uree: b && b['Urée'] && b['Urée'].valeur };
    });
    r.check('créatinine enregistrée', creaRes.crea, '9.2');
    r.check('urée calculée (9.2/44.4=0.21)', creaRes.uree, (9.2 / 44.4).toFixed(2));

    r.section('Transaminases ASAT/ALAT');
    await page.evaluate(() => window.grilleChangeExam('transa'));
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const a = document.getElementById('g_911_asat'); a.value = '35'; a.dispatchEvent(new Event('input', { bubbles: true }));
      const b = document.getElementById('g_911_alat'); b.value = '28'; b.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const tr = await page.evaluate(() => {
      const p = window.__u.find(u => u.p_id === 911);
      const b = p && p.p_resultats['Biochimie'];
      return { asat: b && b['ASAT (TGO)'] && b['ASAT (TGO)'].valeur, alat: b && b['ALAT (TGP)'] && b['ALAT (TGP)'].valeur };
    });
    r.check('ASAT enregistrée', tr.asat, '35');
    r.check('ALAT enregistrée', tr.alat, '28');
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

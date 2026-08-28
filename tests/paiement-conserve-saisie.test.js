// ✅ v13.141 — « J'enregistre mais les valeurs s'évaporent ».
// Cause : le statut de paiement venait d'un cache LOCAL (localStorage), propre à
// chaque poste. La caisse encaissait sur son ordinateur ; le poste de saisie
// voyait « non payé », refusait l'enregistrement ET basculait vers la caisse —
// les résultats tapés étaient perdus.
// Attendu désormais : on revérifie auprès du serveur, et on ne quitte JAMAIS la
// vue de saisie (les valeurs restent à l'écran).
const { serve, openApp, createReporter } = require('./helpers');

const mk = (paye) => ({
  id: 984, type: 'Dossier', montant: 3000, created_at: '2026-08-26T14:00:00Z', created_by: 'YERIGUE',
  patient: Object.assign({ age: '25', nom: 'KOUAME AFFOUE', date: '2026-08-26', sexe: 'F',
    dossier: '0338-0826', medecin: 'IDE BAMBA', service: '', clinique: '' },
    paye ? { paiement_status: 'paye' } : {}),
  resultats: {
    _types: ['Hématologie', 'Immuno-Sérologie'],
    _montants: { 'Hématologie': 3000, 'Immuno-Sérologie': 0 },
    _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 3000 }, 'Immuno-Sérologie': { 'CRP — Protéine C-réactive': 0 } },
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'],
                       'Immuno-Sérologie': ['CRP — Protéine C-réactive'] },
    _reception_seule: false,
  },
  prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
});

async function scenario(page, payeCoteServeur) {
  await page.evaluate((d) => {
    window.__store = [JSON.parse(JSON.stringify(d))]; window.__payload = null;
    window.__vues = [];
    window.showConfirmModal = async () => false;      // « Rester sur la saisie »
    const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
    _sb.rpc = async (n, p) => {
      if (n === 'get_resultats_light') return { data: window.__store.map(light), error: null };
      if (n === 'get_resultat_full') { const x = window.__store.find(z => z.id === p.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
      if (n === 'update_resultat') { window.__payload = p; const x = window.__store.find(z => z.id === p.p_id); if (x && p.p_resultats != null) x.resultats = p.p_resultats; return { data: Object.assign({ created_at: 'x', created_by: 'a' }, x), error: null }; }
      return { data: [], error: null };
    };
    const sv = window.showView;
    window.showView = function (v) { window.__vues.push(v); return sv.apply(this, arguments); };
  }, mk(payeCoteServeur));
  await page.evaluate(() => refreshDB(true));
  await page.waitForTimeout(300);
  await page.evaluate(() => fillAllResults(984));
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el && !el.disabled) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('v_gbc', '7.2'); set('v_gr', '4.5'); set('v_hb', '13'); set('crp_valeur', '48');
  });
  await page.evaluate(() => { window.__vues = []; });
  await page.evaluate(() => saveAllTabs());
  await page.waitForTimeout(1200);
  return page.evaluate(() => ({
    payload: window.__payload,
    gbcEcran: document.getElementById('v_gbc')?.value,
    crpEcran: document.getElementById('crp_valeur')?.value,
    allaCaisse: window.__vues.indexOf('caisse') >= 0,
  }));
}

(async () => {
  const r = createReporter('PAIEMENT — LA SAISIE N EST JAMAIS PERDUE');
  const srv = await serve(8151);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8151 });
    ctx = app.ctx; const { page, errors } = app;

    r.section('Dossier NON encaissé');
    const a = await scenario(page, false);
    r.check('aucun enregistrement (règle métier respectée)', a.payload, null);
    r.check('valeur GB conservée à l\'écran', a.gbcEcran, '7.2');
    r.check('valeur CRP conservée à l\'écran', a.crpEcran, '48');
    r.check('on NE quitte PAS la saisie', a.allaCaisse, false);

    r.section('Dossier encaissé (serveur)');
    const b = await scenario(page, true);
    r.check('enregistrement émis', !!b.payload, true);
    const R = b.payload ? b.payload.p_resultats : {};
    r.check('GB enregistré', R['Hématologie'] && R['Hématologie']['Globules blancs (GB)'] && R['Hématologie']['Globules blancs (GB)'].valeur, '7.2');
    r.check('CRP enregistrée', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['CRP - Valeur'], '48');
    r.check('examens demandés intacts', Object.keys(R._examens_coches || {}).length, 2);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

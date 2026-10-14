// ✅ v13.141 — « J'enregistre mais les valeurs s'évaporent ».
// Cause : le statut de paiement venait d'un cache LOCAL (localStorage), propre à
// chaque poste. La caisse encaissait sur son ordinateur ; le poste de saisie
// voyait « non payé », refusait l'enregistrement ET basculait vers la caisse —
// les résultats tapés étaient perdus.
// Attendu désormais (« tout par la série ») : les valeurs tapées dans la série
// sont enregistrées, encaissé ou non, sans jamais basculer vers la caisse.
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
  // ✅ TOUT PAR LA SÉRIE : compléter le dossier ouvre la série centrée sur lui.
  await page.evaluate(() => fillAllResults(984));
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el && !el.disabled) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
    ['gbc', 'gr', 'hb', 'ht', 'plt', 'pnn', 'lymp', 'mono'].forEach((k, i) => set('g_984_nfs_' + k, ['7.2', '4.5', '13', '39', '250', '60', '30', '8'][i]));
    set('g_984_crp_crp', '48');
    set('g_984_ge_geres', 'Négatif');
  });
  await page.evaluate(() => { window.__vues = []; });
  await page.evaluate(() => grilleSaveAll());
  await page.waitForTimeout(1200);
  return page.evaluate(() => ({
    payload: window.__payload,
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

    // Dans la série, les résultats s'enregistrent même si le dossier n'est pas
    // encore encaissé : c'est la REMISE (impression) qui exige l'encaissement.
    for (const [titre, paye] of [['Dossier NON encaissé', false], ['Dossier encaissé (serveur)', true]]) {
      r.section(titre);
      const b = await scenario(page, paye);
      r.check('enregistrement émis', !!b.payload, true);
      const R = b.payload ? b.payload.p_resultats : {};
      r.check('GB enregistré', R['Hématologie'] && R['Hématologie']['Globules blancs (GB)'] && R['Hématologie']['Globules blancs (GB)'].valeur, '7.2');
      r.check('CRP enregistrée', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['CRP - Valeur'], '48');
      r.check('examens demandés intacts', Object.keys(R._examens_coches || {}).length, 2);
      r.check('on ne bascule PAS vers la caisse', b.allaCaisse, false);
    }

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

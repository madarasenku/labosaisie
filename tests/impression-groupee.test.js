// ════════════════════════════════════════════════════════════════════
//  impression-groupee — imprimer les comptes rendus de plusieurs dossiers
//  cochés dans l'Historique (un par page).
//    • ordre d'arrivée des patients ;
//    • non-admin : seulement les dossiers ENCAISSÉS (comme l'impression unitaire) ;
//    • admin : tous, informé des non encaissés ;
//    • dossiers sans aucun résultat : écartés.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const CIBLE = process.env.CIBLE || '/index.html';
const AUJ = new Date().toISOString().slice(0, 10);
const NFS = 'NFS — Numération Formule Sanguine';
const dossier = (id, heure, paye, avecResultat) => ({
  id, type: 'Dossier', montant: 3000, created_at: AUJ + 'T' + heure + ':00Z', created_by: 'YERIGUE',
  patient: { nom: 'P' + id, dossier: 'D' + id, date: AUJ, sexe: 'F', age: 30, statut: 'rendu',
             paiement_status: paye ? 'paye' : 'non_paye' },
  resultats: Object.assign({ _types: ['Hématologie'], _examens_coches: { 'Hématologie': [NFS] } },
    avecResultat ? { 'Hématologie': { 'Globules blancs (GB)': { valeur: '6.4', unite: '10³/µL' } } } : {}),
  prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});
const D = [
  dossier(1, '10:00', true, true),    // encaissé + résultat
  dossier(2, '11:00', false, true),   // NON encaissé + résultat
  dossier(3, '12:00', true, false),   // encaissé, SANS résultat
  dossier(4, '08:00', true, true),    // encaissé + résultat, arrivé le premier
];

async function scenario(role, username) {
  const port = role === 'admin' ? 8263 : 8262;
  const srv = await serve(port);
  const app = await openApp({ role, username, userId: 10, cible: CIBLE, port });
  const { page } = app;
  await page.evaluate(data => {
    window.__toasts = []; window.toast = m => window.__toasts.push(String(m));
    window.__imprimes = null;
    window.printLot = async recs => { window.__imprimes = recs.map(r => r.id); };
    _sb.rpc = async (nom, params) => {
      if (nom === 'get_resultats_light') return { data: data.map(d => Object.assign({}, d, { resultats: Object.fromEntries(Object.entries(d.resultats).filter(([k]) => k[0] === '_')) })), error: null };
      if (nom === 'get_resultat_full') { const x = data.find(z => z.id === params.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
      return { data: [], error: null };
    };
  }, D);
  await page.evaluate(() => refreshDB(true));
  await page.evaluate(() => { showView('historique'); setHistPeriode('tout'); });
  await page.waitForTimeout(500);
  await page.evaluate(() => renderHistory());
  await page.waitForTimeout(500);
  const res = await page.evaluate(async () => {
    _selectedIds = new Set([1, 2, 3, 4]); _filterCorbeille = false;
    updateBulkToolbar();
    const btn = document.getElementById('bulk-print-btn');
    const visible = !!btn && btn.style.display !== 'none';
    await bulkImprimer();
    _filterCorbeille = true; updateBulkToolbar();
    const corbeille = btn && btn.style.display !== 'none';
    _filterCorbeille = false;
    return { visible, corbeille, imprimes: window.__imprimes, toasts: window.__toasts.slice() };
  });
  res.errors = app.errors.slice();
  await app.ctx.close(); srv.close();
  return res;
}

(async () => {
  const r = createReporter('IMPRESSION GROUPÉE (HISTORIQUE)');

  r.section('Agent');
  const ag = await scenario('agent', 'YERIGUE');
  r.check('bouton « Imprimer » dans la barre d\'actions', ag.visible, true);
  r.check('masqué dans la corbeille', ag.corbeille, false);
  r.check('imprime les encaissés avec résultat, dans l\'ordre d\'arrivée', JSON.stringify(ag.imprimes), '[4,1]');
  r.check('signale les exclus (non encaissé, sans résultat)',
    ag.toasts.some(t => /non encaissé/.test(t) && /sans résultat/.test(t)), true);
  r.check('aucune erreur JS', ag.errors.length, 0);

  r.section('Administrateur');
  const ad = await scenario('admin', 'admin');
  r.check('imprime aussi les non encaissés (ordre d\'arrivée)', JSON.stringify(ad.imprimes), '[4,1,2]');
  r.check('informé des non encaissés inclus', ad.toasts.some(t => /non encaissé\(s\) inclus/.test(t)), true);
  r.check('le dossier sans résultat reste écarté', (ad.imprimes || []).includes(3), false);
  r.check('aucune erreur JS', ad.errors.length, 0);

  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

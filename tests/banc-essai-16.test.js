// ✅ BANC D'ESSAI — 16 patients « ESSAI 0..15 » (mêmes combinaisons qu'en base),
// saisie en série par lots séparés, puis impression. Reproduit fidèlement la
// production : get_resultat_full renvoie un TABLEAU (RETURNS SETOF).
const { serve, openApp, createReporter } = require('./helpers');

const EX = {
  nfs:    ['Hématologie', 'NFS — Numération Formule Sanguine', 3000],
  ge:     ['Hématologie', 'Goutte épaisse / TDR Paludisme', 0],
  crp:    ['Immuno-Sérologie', 'CRP — Protéine C-réactive', 3500],
  swf:    ['Immuno-Sérologie', 'Widal & Félix (SWF)', 4500],
  gly:    ['Biochimie', 'Glycémie à jeun', 2000],
  uree:   ['Biochimie', 'Urée', 2000],
  crea:   ['Biochimie', 'Créatinine', 2000],
  transa: ['Biochimie', 'ASAT / ALAT (Transaminases)', 5000],
};
const COMBOS = [
  ['nfs'], ['ge'], ['crp'], ['swf'], ['gly'], ['crea'], ['uree'], ['transa'],
  ['nfs','ge'], ['nfs','crp'], ['crp','swf'], ['gly','crea','uree'],
  ['nfs','ge','crp'], ['nfs','ge','crp','swf'],
  ['gly','crea','uree','transa'],
  ['nfs','ge','crp','swf','gly','crea','uree','transa'],
];
const FIXTURES = COMBOS.map((combo, i) => {
  const coches = {}, prix = {}, montants = {};
  combo.forEach(k => { const [t, lab, p] = EX[k];
    (coches[t] = coches[t] || []).push(lab); (prix[t] = prix[t] || {})[lab] = p;
    montants[t] = (montants[t] || 0) + p; });
  const total = Object.values(montants).reduce((a, b) => a + b, 0);
  return { id: 1007 + i, type: 'Dossier', montant: total, created_at: '2026-08-26T18:00:00Z', created_by: 'YERIGUE',
    patient: { nom: 'ESSAI ' + i, dossier: String(361 + i).padStart(4, '0') + '-0826', date: '2026-08-26',
               sexe: i % 2 === 0 ? 'M' : 'F', age: String(5 + i * 3), medecin: 'DR ESSAI',
               service: 'Banc de test', clinique: '', paiement_status: 'paye' },
    resultats: { _types: Object.keys(coches), _facture_seule: true, _reception_seule: false,
                 _examens_coches: coches, _examens_prix: prix, _montants: montants },
    prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null };
});

(async () => {
  const r = createReporter('BANC D\'ESSAI — 16 PATIENTS, LOTS SÉPARÉS, IMPRESSION');
  const srv = await serve(8160);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8160 });
    ctx = app.ctx; const { page, errors } = app;

    await page.evaluate((fx) => {
      window.__store = JSON.parse(JSON.stringify(fx));
      window.showConfirmModal = async () => true;
      window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (n, p) => {
        if (n === 'get_resultats_light') return { data: window.__store.map(light), error: null };
        // ⚠ FORME RÉELLE : SETOF → tableau
        if (n === 'get_resultat_full') { const x = window.__store.find(z => z.id === p.p_id); return { data: x ? [{ resultats: x.resultats }] : [], error: null }; }
        if (n === 'update_resultat') { const x = window.__store.find(z => z.id === p.p_id); if (x && p.p_resultats != null) x.resultats = p.p_resultats; window.__nUpd = (window.__nUpd || 0) + 1; return { data: [Object.assign({ created_at: 'x', created_by: 'a' }, x)], error: null }; }
        return { data: [], error: null };
      };
    }, FIXTURES);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(400);
    await page.evaluate(() => { showView('saisie'); _grilleDate = ''; _grilleInclureSaisis = false; ouvrirGrille(); });
    await page.waitForTimeout(700);

    r.section('Grille unifiée');
    r.check('16 patients listés', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 16);
    // (esc() échappe « & » : on compare sur le libellé échappé)
    const cols = await page.evaluate(() => { const h = document.getElementById('grille-serie').innerHTML;
      const e = t => t.replace(/&/g, '&amp;');
      return Object.keys(GRILLE_EXAMS).filter(k => h.indexOf(e(GRILLE_EXAMS[k].label)) >= 0); });
    r.check('colonnes = tous les examens demandés', cols.slice().sort().join(','), 'crea,crp,ge,gly,nfs,transa,uree,widal');
    r.check('ESSAI 1 (GE seul) listé', await page.evaluate(() => !!document.getElementById('g_1008_ge_geres')), true);
    r.check('ESSAI 3 (SWF seul) listé', await page.evaluate(() => !!document.getElementById('g_1010_widal_wto')), true);
    r.check('ESSAI 6 (Urée seule) listé', await page.evaluate(() => !!document.getElementById('g_1013_uree_uree')), true);
    r.check('ESSAI 0 a une case NFS', await page.evaluate(() => !!document.getElementById('g_1007_nfs_gbc')), true);
    r.check('ESSAI 0 n\'a PAS de case CRP', await page.evaluate(() => !document.getElementById('g_1007_crp_crp')), true);
    r.check('ESSAI 15 a NFS + CRP + bio', await page.evaluate(() => !!document.getElementById('g_1022_nfs_gbc') && !!document.getElementById('g_1022_crp_crp') && !!document.getElementById('g_1022_gly_gly')), true);

    // ── LOT 1 : uniquement les NFS de 3 patients ─────────────────
    r.section('Lot 1 — NFS de 3 patients seulement');
    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      [1007, 1015, 1022].forEach((d, n) => ['gbc','gr','hb','ht','plt','pnn','pne','pnb','lymp','mono']
        .forEach((k, i) => set('g_' + d + '_nfs_' + k, String(4 + n + i))));
    });
    await page.waitForTimeout(300);
    r.check('3 lignes cochées automatiquement', await page.evaluate(() => grilleSelectedIds().length), 3);
    await page.evaluate(() => { window.__nUpd = 0; return grilleSaveAll(); });
    await page.waitForTimeout(2500);
    r.check('3 écritures (1 par patient)', await page.evaluate(() => window.__nUpd), 3);
    const l1 = await page.evaluate(() => [1007, 1015, 1022].map(id => {
      const x = window.__store.find(z => z.id === id);
      return !!(x.resultats['Hématologie'] && x.resultats['Hématologie']['Globules blancs (GB)'].valeur); }));
    r.check('NFS enregistrée pour les 3', l1.join(','), 'true,true,true');
    r.check('ESSAI 15 : CRP intacte (pas encore saisie)', await page.evaluate(() => {
      const x = window.__store.find(z => z.id === 1022);
      return !(x.resultats['Immuno-Sérologie'] && x.resultats['Immuno-Sérologie']['CRP - Valeur']); }), true);
    r.check('ESSAI 15 : examens demandés intacts (3 types)', await page.evaluate(() => {
      const x = window.__store.find(z => z.id === 1022); return Object.keys(x.resultats._examens_coches).length; }), 3);

    // ── LOT 2 : CRP + biochimie d'ESSAI 15 ───────────────────────
    r.section('Lot 2 — CRP et biochimie d\'ESSAI 15');
    await page.evaluate(() => { _grilleInclureSaisis = false; grilleRender(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const set = (id, v, ev) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); } };
      set('g_1022_crp_crp', '48', 'change');
      set('g_1022_gly_gly', '0.92', 'input');
      set('g_1022_crea_crea', '9.4', 'input');
      set('g_1022_transa_asat', '22', 'input');
      set('g_1022_transa_alat', '25', 'input');
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__nUpd = 0; return grilleSaveAll(); });
    await page.waitForTimeout(2000);
    const f = await page.evaluate(() => { const x = window.__store.find(z => z.id === 1022); const R = x.resultats;
      return { gb: R['Hématologie'] && R['Hématologie']['Globules blancs (GB)'].valeur,
               crp: R['Immuno-Sérologie'] && R['Immuno-Sérologie']['CRP - Valeur'],
               gly: R['Biochimie'] && R['Biochimie']['Glycémie à jeun'] && R['Biochimie']['Glycémie à jeun'].valeur,
               asat: R['Biochimie'] && R['Biochimie']['ASAT (TGO)'] && R['Biochimie']['ASAT (TGO)'].valeur,
               coches: Object.keys(R._examens_coches).length, serie: Object.keys(R._saisi_serie || {}).sort().join(',') }; });
    r.check('NFS du lot 1 TOUJOURS là', !!f.gb, true);
    r.check('CRP enregistrée', f.crp, '48');
    r.check('Glycémie enregistrée', f.gly, '0.92');
    r.check('ASAT enregistrée', f.asat, '22');
    r.check('examens demandés toujours intacts', f.coches, 3);
    r.check('marqueurs série', f.serie, 'crea,crp,gly,nfs,transa');

    // ── IMPRESSION ───────────────────────────────────────────────
    r.section('Impression du compte rendu');
    await page.evaluate(() => { window.__printed = null; return printRecord(1022); });
    await page.waitForTimeout(2000);
    const pr = await page.evaluate(() => window.__printed || '');
    r.check('impression produite', pr.length > 1000, true);
    r.check('en-tête CPMI', /CPMI DE GRAND-BASSAM/.test(pr), true);
    r.check('nom patient', /ESSAI 15/.test(pr), true);
    r.check('NFS imprimée', /NFS — Numération Formule Sanguine/.test(pr), true);
    r.check('CRP imprimée', /CRP — Protéine C-réactive/.test(pr), true);
    r.check('Biochimie imprimée', /Biochimie — Glucides/.test(pr), true);
    r.check('Widal demandé mais non saisi → signalé', /Non réalisé|Widal/.test(pr), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

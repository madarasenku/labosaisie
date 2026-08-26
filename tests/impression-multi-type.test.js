// ✅ v13.136 — Impression d'un dossier MULTI-analyses (NFS + CRP).
// Régression : buildPrintSections utilisait une variable « r » inexistante dans
// la branche composite → ReferenceError → l'impression d'un dossier à plusieurs
// examens échouait (« je n'arrive pas à exporter pour impression »). On vérifie
// que les DEUX sections s'affichent, en impression unitaire ET en lot.
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 1001, type: 'Dossier', montant: 11000, created_at: '2026-08-26T09:00:00Z',
  patient: { nom: 'MULTI ANALYSE', dossier: '1001-0826', sexe: 'M', age: 30, date: '2026-08-26' },
  resultats: {
    _types: ['Hématologie', 'Immuno-Sérologie'],
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'], 'Immuno-Sérologie': ['CRP — Protéine C-réactive'] },
    _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 5000 }, 'Immuno-Sérologie': { 'CRP — Protéine C-réactive': 6000 } },
    _montants: { 'Hématologie': 5000, 'Immuno-Sérologie': 6000 },
    'Hématologie': {
      'Globules blancs (GB)': { valeur: '7.2', unite: '10³/µL', interp: '' },
      'Hémoglobine (Hb)': { valeur: '13', unite: 'g/dL', interp: '' },
    },
    'Immuno-Sérologie': { 'CRP - Valeur': '48', 'CRP - Interprétation': 'CRP élevée' },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('IMPRESSION — DOSSIER MULTI-ANALYSES');
  const srv = await serve(8137);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8137 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d) => {
      window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') { const res = {}; Object.keys(d.resultats).forEach(k => { if (k[0] === '_') res[k] = d.resultats[k]; }); return { data: [Object.assign({}, d, { resultats: res })], error: null }; }
        if (nom === 'get_resultat_full') return { data: { resultats: d.resultats }, error: null };
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    // Impression unitaire (chemin composite _dossier:true).
    r.section('Impression unitaire (printRecord)');
    await page.evaluate(() => { window.__printed = null; return printRecord(1001); });
    await page.waitForTimeout(1200);
    const p1 = await page.evaluate(() => window.__printed || '');
    r.check('impression produite (pas de crash)', p1.length > 0, true);
    // ✅ v13.139 — Le compte rendu titre par EXAMEN (modèle validé), plus par type.
    r.check('section NFS présente', /NFS — Numération Formule Sanguine/.test(p1), true);
    r.check('section CRP présente', /CRP — Protéine C-réactive/.test(p1), true);
    r.check('valeur GB rendue', /7\.2/.test(p1), true);

    // Impression en lot (printLot doit aussi produire le composite).
    r.section('Impression en lot (printLot)');
    await page.evaluate(() => { window.__printed = null; const rec = getDB().find(x => x.id === 1001); return printLot([rec]); });
    await page.waitForTimeout(1200);
    const p2 = await page.evaluate(() => window.__printed || '');
    r.check('lot : NFS présente', /NFS — Numération Formule Sanguine/.test(p2), true);
    r.check('lot : en-tête CPMI', /CPMI DE GRAND-BASSAM/.test(p2), true);
    r.check('lot : CRP présente', /CRP/.test(p2), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 6));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

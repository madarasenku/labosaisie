// ✅ v13.146 — Correctif 1 : dossier MONO-ANALYSE = compte rendu vide.
// printRecord() aplatit un dossier à une seule analyse (type='<analyse>',
// resultats = le sous-objet du type, _examens_coches en TABLEAU) avant
// d'appeler crBuildHTML, qui attendait le format dossier complet
// (R['Biochimie'] = {…}). Sans le correctif, chaque examen biochimie
// ressort dans le bloc « non réalisé » au lieu d'afficher sa valeur.
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 3001, type: 'Dossier', montant: 6000, created_at: '2026-09-06T09:00:00Z',
  patient: { nom: 'MONO BIOCHIMIE', dossier: '3001-0906', sexe: 'M', age: 40, date: '2026-09-06' },
  resultats: {
    _types: ['Biochimie'],
    _examens_coches: { 'Biochimie': ['Glycémie à jeun', 'Créatinine'] },
    _examens_prix: { 'Biochimie': { 'Glycémie à jeun': 3000, 'Créatinine': 3000 } },
    _montants: { 'Biochimie': 6000 },
    'Biochimie': {
      'Glycémie à jeun': { valeur: '0.95', unite: 'g/L', interp: '' },
      'Créatinine': { valeur: '8.4', unite: 'mg/L', interp: '' },
    },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('COMPTE RENDU — DOSSIER MONO-ANALYSE (BIOCHIMIE SEULE)');
  const srv = await serve(8145);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8145 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d) => {
      window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
      _sb.rpc = async (nom) => {
        if (nom === 'get_resultats_light') { const res = {}; Object.keys(d.resultats).forEach(k => { if (k[0] === '_') res[k] = d.resultats[k]; }); return { data: [Object.assign({}, d, { resultats: res })], error: null }; }
        if (nom === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    r.section('Impression du dossier mono-analyse (printRecord)');
    await page.evaluate(() => { window.__printed = null; return printRecord(3001); });
    await page.waitForTimeout(1200);
    const h = await page.evaluate(() => window.__printed || '');
    const txt = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    r.check('impression produite (pas de crash)', h.length > 0, true);
    r.check('Glycémie rendue (valeur, pas « non réalisé »)', /0\.95/.test(txt), true);
    r.check('Créatinine rendue', /8\.4/.test(txt), true);
    r.check('groupe Biochimie — Glucides présent', /Biochimie — Glucides/.test(txt), true);
    r.check('groupe Biochimie — Fonction rénale présent', /Biochimie — Fonction rénale/.test(txt), true);
    // ✅ Avant le correctif 1 : R['Biochimie'] était introuvable, crExamFait
    // renvoyait false pour les deux examens cochés → bloc « non réalisé ».
    r.check('AUCUN bloc « non réalisés »', /Examens demandés — non réalisés/.test(txt), false);
    r.check('pas de « Aucun résultat saisi »', /Aucun résultat saisi/.test(txt), false);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 6));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

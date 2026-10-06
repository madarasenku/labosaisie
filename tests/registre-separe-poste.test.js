// ✅ v13.231 — Le registre du jour imprimé est SÉPARÉ par poste : une page
// « Registre de permanence » (08h–16h) et une page « Registre de garde »
// (16h–08h), chacune avec son propre total. Plus de colonne « Poste ».
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8295);
  const r = createReporter('REGISTRE — SÉPARÉ PERMANENCE / GARDE');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8295 });

  const d = new Date().toISOString().slice(0, 10);
  const res = await page.evaluate(async (jour) => {
    window.__printed = null;
    window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
    _sb.rpc = async () => ({ data: [], error: null });
    _dbCache = [
      { id: 1, type: 'Dossier', createdBy: 'a', montant: 3000, savedAt: jour + 'T09:00:00Z',
        patient: { nom: 'PERMA PATIENT', dossier: 'P-1', date: jour },
        resultats: { _types: ['Hématologie'], _examens_coches: { 'Hématologie': ['NFS'] },
                     'Hématologie': { 'Globules blancs (GB)': { valeur: '6', unite: '10³/µL' } } } },
      { id: 2, type: 'Dossier', createdBy: 'a', montant: 5000, savedAt: jour + 'T22:00:00Z',
        patient: { nom: 'GARDE PATIENT', dossier: 'G-1', date: jour },
        resultats: { _types: ['Biochimie'], _examens_coches: { 'Biochimie': ['Glycémie'] },
                     'Biochimie': { 'Glycémie à jeun': { valeur: '0.9', unite: 'g/L' } } } },
    ];
    await imprimerRegistre(jour);
    await new Promise(r => setTimeout(r, 300));
    const h = window.__printed || '';
    const txt = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    return {
      h, txt,
      iPerm: txt.indexOf('REGISTRE DE PERMANENCE'),
      iGarde: txt.indexOf('REGISTRE DE GARDE'),
      iPermaPat: txt.indexOf('PERMA PATIENT'),
      iGardePat: txt.indexOf('GARDE PATIENT'),
    };
  }, d);

  r.section('Deux registres distincts');
  r.check('page « Registre de permanence »', res.iPerm >= 0, true);
  r.check('page « Registre de garde »', res.iGarde >= 0, true);
  r.check('saut de page entre les deux', /break-before:page/.test(res.h), true);
  r.check('permanence avant garde', res.iPerm < res.iGarde, true);

  r.section('Chaque patient dans son registre');
  r.check('patient de permanence présent', res.iPermaPat >= 0, true);
  r.check('patient de garde présent', res.iGardePat >= 0, true);
  r.check('patient permanence AVANT le titre garde', res.iPermaPat < res.iGarde, true);
  r.check('patient garde APRÈS le titre garde', res.iGardePat > res.iGarde, true);

  r.section('Plus de colonne Poste, deux totaux');
  r.check('en-tête « Poste » retiré', /<th[^>]*>\s*Poste\s*<\/th>/i.test(res.h), false);
  r.check('deux lignes TOTAL (une par registre)', (res.h.match(/TOTAL/g) || []).length, 2);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

// ✅ v13.212 — Le bouton « Imprimer le registre du jour » en haut de l'historique
// doit produire le registre imprimable, pour un AGENT, sans passer par la caisse.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8274);
  const r = createReporter('REGISTRE — IMPRESSION DEPUIS HISTORIQUE');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'yerigue', port: 8274 });

  await page.evaluate(() => { showView('historique'); });
  await page.waitForTimeout(300);

  const res = await page.evaluate(async () => {
    window.__printed = null;
    window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
    const d = new Date().toISOString().slice(0, 10);
    _sb.rpc = async (n) => ({ data: n === 'get_resultat_full'
      ? [{ resultats: { 'Hématologie': { 'Globules blancs (GB)': { valeur: '6.4', unite: '10³/µL' } } } }] : [], error: null });
    _dbCache = [
      { id: 1, type: 'Dossier', createdBy: 'yerigue', montant: 4000, savedAt: d + 'T09:00:00Z', _light: true,
        patient: { nom: 'KONE', dossier: '0601-1026', date: d, medecin: 'Dr X' },
        resultats: { _types: ['Hématologie'], _examens_coches: { 'Hématologie': ['NFS'] } } },
    ];
    const champ = document.getElementById('hist-registre-date');
    const btn = document.querySelector('button[onclick="imprimerRegistreDepuisHistorique()"]');
    await imprimerRegistreDepuisHistorique();
    await new Promise(r => setTimeout(r, 300));
    const txt = (window.__printed || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    return {
      champPresent: !!champ, boutonPresent: !!btn, fn: typeof imprimerRegistreDepuisHistorique,
      imprime: txt.length > 0, titre: /REGISTRE DU JOUR/.test(txt), patient: /KONE/.test(txt),
    };
  });

  r.section('Bouton opérationnel');
  r.check('champ date présent', res.champPresent, true);
  r.check('bouton présent dans l\'historique', res.boutonPresent, true);
  r.check('fonction définie', res.fn, 'function');
  r.check('le registre est imprimé', res.imprime, true);
  r.check('titre « REGISTRE DU JOUR »', res.titre, true);
  r.check('le patient du jour figure', res.patient, true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

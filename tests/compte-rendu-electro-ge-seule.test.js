// Compte rendu — « électrophorèse seule » et « GE seule ».
//
// Bugs réels (production, oct. 2026) :
//  • une ligne de BASOPHILES (formule leucocytaire préremplie) sortait SEULE en
//    haut d'un rendu ne commandant que l'électrophorèse ou que la goutte épaisse,
//    car le bloc NFS n'était pas gardé et imprimait tout paramètre héma non vide ;
//  • l'électrophorèse envoyée au labo externe (non faite) devait apparaître
//    explicitement « Non effectué » en bas du rendu.
//
// Règles verrouillées ici :
//  - la formule leucocytaire n'apparaît qu'avec un hémogramme réel (GB présent) ;
//  - le bloc NFS ne s'imprime que si NFS / VS / BPN est demandé ;
//  - l'électrophorèse demandée mais non faite → « Non effectué » ;
//  - l'électrophorèse faite (profil posé) → tableau imprimé, pas de « Non effectué ».
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('COMPTE RENDU — ÉLECTRO / GE SEULE');
  const srv = await serve(8178);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8178 });
    ctx = app.ctx; const { page, errors } = app;

    const res = await page.evaluate(async () => {
      const mk = (coches, hema) => ({ id: 1, type: 'Dossier',
        patient: { nom: 'TEST', dossier: '0001-0826', sexe: 'F', age: 30, date: '2026-10-04' },
        resultats: Object.assign({ _examens_coches: coches },
          { 'Hématologie': hema, 'Biochimie': {}, 'Immuno-Sérologie': {}, 'Groupe sanguin': {} }) });
      // Basophile prérempli (contamination) sans Globules blancs.
      const baso = { 'Polynucléaires basophiles (PNB)': { valeur: '0', unite: '%' } };

      const electroSeule = await crBuildHTML(mk(
        { 'Hématologie': ["Électrophorèse de l'hémoglobine"] }, Object.assign({}, baso)));
      const geSeule = await crBuildHTML(mk(
        { 'Hématologie': ['Goutte épaisse (GE)'] },
        Object.assign({ 'GE - Résultat': { valeur: 'Négatif' } }, baso)));
      const electroFaite = await crBuildHTML(mk(
        { 'Hématologie': ["Électrophorèse de l'hémoglobine"] },
        Object.assign({ 'Profil Hb': { valeur: 'AA' } }, baso)));
      const nfsNormale = await crBuildHTML(mk(
        { 'Hématologie': ['NFS — Numération Formule Sanguine'] },
        { 'Globules blancs (GB)': { valeur: '6000', unite: '/mm³' },
          'Polynucléaires basophiles (PNB)': { valeur: '1', unite: '%' } }));

      return {
        el_baso: /basoph/i.test(electroSeule),
        el_nfsTable: /NFS — Num/i.test(electroSeule),
        el_nonEffectue: /Non effectué/i.test(electroSeule),
        ge_baso: /basoph/i.test(geSeule),
        ge_nfsTable: /NFS — Num/i.test(geSeule),
        ge_electro: /Électrophorèse de l/i.test(geSeule),
        fait_nonEffectue: /Non effectué/i.test(electroFaite),
        fait_profil: /Profil/i.test(electroFaite),
        nfs_baso: /basoph/i.test(nfsNormale),
        nfs_table: /NFS — Num/i.test(nfsNormale),
      };
    });

    r.section('Électrophorèse seule (non faite)');
    r.check('pas de ligne basophiles', res.el_baso, false);
    r.check('pas de tableau NFS', res.el_nfsTable, false);
    r.check('« Non effectué » présent', res.el_nonEffectue, true);

    r.section('Goutte épaisse seule');
    r.check('pas de ligne basophiles', res.ge_baso, false);
    r.check('pas de tableau NFS', res.ge_nfsTable, false);
    r.check('pas de contamination électrophorèse', res.ge_electro, false);

    r.section('Électrophorèse faite (profil posé)');
    r.check('profil imprimé', res.fait_profil, true);
    r.check('pas de « Non effectué »', res.fait_nonEffectue, false);

    r.section('NFS normale (non-régression)');
    r.check('basophiles légitime conservé', res.nfs_baso, true);
    r.check('tableau NFS présent', res.nfs_table, true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

// ✅ v13.206 — Classement des examens + grille par défaut.
// • La coagulation (TP, TCA, Fibrinogène, D-Dimères) est classée en Hématologie
//   (liste de sélection) — plus en Biochimie.
// • Le compte rendu titre la coagulation « Hématologie — Hémostase ».
// • ASLO passe à 8000 (grille de la base devenue défaut).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('CLASSEMENT EXAMENS + GRILLE PAR DÉFAUT');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  const cat = await page.evaluate(() => {
    const byId = {};
    CATALOGUE_EXAMENS.forEach(e => { byId[e.id] = e; });
    return {
      tp: byId.ex_tp && byId.ex_tp.groupe, tca: byId.ex_tca && byId.ex_tca.groupe,
      fibr: byId.ex_fibr && byId.ex_fibr.groupe, ddim: byId.ex_ddim && byId.ex_ddim.groupe,
      aso: byId.ex_aso && byId.ex_aso.prix,
      titreCoag: (typeof crGroupesBio === 'function'
        ? (crGroupesBio().find(([grp]) => grp === (typeof BIO_COAG !== 'undefined' ? BIO_COAG : null)) || [])[1]
        : null),
    };
  });

  r.section('Coagulation classée en Hématologie (sélection)');
  r.check('TP / INR → Hématologie',  /Hématologie/.test(cat.tp || ''), true);
  r.check('TCA → Hématologie',       /Hématologie/.test(cat.tca || ''), true);
  r.check('Fibrinogène → Hématologie', /Hématologie/.test(cat.fibr || ''), true);
  r.check('D-Dimères → Hématologie', /Hématologie/.test(cat.ddim || ''), true);

  r.section('Compte rendu : titre de la coagulation');
  r.check('titré « Hématologie — Hémostase »', /Hématologie.*mostase/.test(cat.titreCoag || ''), true);

  r.section('Grille par défaut alignée sur la base');
  r.check('ASLO = 8000', cat.aso, 8000);

  r.check('aucune erreur JS', errors.length, 0);
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

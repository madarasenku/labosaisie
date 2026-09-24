// ✅ v13.203 — L'Historique s'ouvre réellement sur le JOUR, et le filtre texte
// réagit à chaque frappe (tape / efface / retape).
//
// Régression : le bouton « Aujourd'hui » était allumé mais les CHAMPS de dates
// restaient vides à l'ouverture, donc le filtrage (qui lit ces champs) montrait
// TOUT. On applique désormais la période active à l'ouverture.
const { serve, openApp, createReporter, histRows, ATTENDU } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('HISTORIQUE — OUVERTURE SUR LE JOUR + FILTRE');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  // Ouvrir l'onglet comme un vrai utilisateur (sans clearAll qui force « Tout »).
  await page.evaluate(() => showView('historique'));
  await page.waitForTimeout(1300);

  r.section("À l'ouverture : seulement le jour");
  r.check('période = jour', await page.evaluate(() => _histPeriode), 'jour');
  r.check('liste = fiches du jour (pas tout)', await histRows(page), ATTENDU.jour);
  r.check('la liste n\'est PAS « tout »', await histRows(page) !== ATTENDU.tout, true);
  r.check("champ « de » = aujourd'hui",
    await page.evaluate(() => document.getElementById('filter-date-from').value), ATTENDU.aujourdhui);

  const tape = v => page.evaluate(x => {
    const e = document.getElementById('search-input');
    e.value = x; e.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

  r.section('Filtre texte : tape / efface / retape');
  await tape('KOUAME'); await page.waitForTimeout(1000);
  r.check('recherche KOUAME → des résultats', await histRows(page) > 0, true);
  r.check('... bascule sur Tout', await page.evaluate(() => _histPeriode), 'tout');

  await tape(''); await page.waitForTimeout(800);
  r.check('effacé → retour au jour', await page.evaluate(() => _histPeriode), 'jour');
  r.check('effacé → liste du jour', await histRows(page), ATTENDU.jour);

  await tape('KOUAME'); await page.waitForTimeout(1000);
  r.check('RETAPE KOUAME → les résultats reviennent', await histRows(page) > 0, true);
  r.check('... rebascule sur Tout', await page.evaluate(() => _histPeriode), 'tout');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

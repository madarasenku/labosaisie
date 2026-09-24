// ✅ v13.202 — Vue journalière par défaut (Historique + vues liées).
//
// L'utilisateur veut que TOUT soit journalier par défaut : au démarrage, après
// « Réinitialiser », et après avoir vidé une recherche. Deux chemins seuls
// s'écartaient de « Aujourd'hui » :
//   • « Réinitialiser » renvoyait au mois avec « Tout » allumé ;
//   • taper une recherche basculait sur « Tout » et l'y laissait, même une fois
//     la recherche vidée.
// Ce fichier vérifie qu'on revient toujours à la vue du jour — sauf si on a
// explicitement choisi une autre période.
const { serve, openApp, createReporter } = require('./helpers');

const admin = { role: 'admin', username: 'admin1', userId: 1,
                rpc: { get_tarifs: {}, get_examens_custom: [] } };

const boutonActif = page => page.evaluate(() =>
  ([...document.querySelectorAll('[id^=hist-btn-].active')].map(b => b.id.replace('hist-btn-', ''))[0]) || '(aucun)');

(async () => {
  const srv = await serve();
  const r = createReporter('VUE JOURNALIÈRE PAR DÉFAUT');
  const { ctx, page, errors } = await openApp(admin);

  await page.evaluate(() => {
    showView('historique');
    // Neutraliser les allers-retours réseau : la logique de période est
    // synchrone, seul refreshDB serait asynchrone.
    window.refreshDB = async () => {};
    window.showLoading = () => {}; window.hideLoading = () => {};
    window.renderHistory = () => {};
  });
  await page.waitForTimeout(300);

  r.section('Au démarrage, la vue est journalière');
  r.check('période = jour', await page.evaluate(() => _histPeriode), 'jour');
  r.check('bouton « Aujourd\'hui » actif', await boutonActif(page), 'jour');

  r.section('« Réinitialiser » revient au jour (plus de mois/Tout)');
  await page.evaluate(() => { _histPeriode = 'mois'; clearSearchFilters(); });
  await page.waitForTimeout(150);
  r.check('période = jour', await page.evaluate(() => _histPeriode), 'jour');
  r.check('bouton « Aujourd\'hui » actif', await boutonActif(page), 'jour');
  r.check('bouton « Tout » PAS actif',
    await page.evaluate(() => !document.getElementById('hist-btn-tout').classList.contains('active')), true);

  r.section('Recherche → Tout, puis recherche vidée → retour au jour');
  await page.evaluate(async () => {
    document.getElementById('search-input').value = 'dupont';
    renderHistoryDebounced();
  });
  await page.waitForTimeout(600);
  r.check('la recherche a basculé sur Tout', await page.evaluate(() => _histPeriode), 'tout');
  r.check('bascule marquée comme automatique', await page.evaluate(() => _histToutParRecherche), true);
  await page.evaluate(async () => {
    document.getElementById('search-input').value = '';
    renderHistoryDebounced();
  });
  await page.waitForTimeout(400);
  r.check('recherche vidée → retour au jour', await page.evaluate(() => _histPeriode), 'jour');
  r.check('bouton « Aujourd\'hui » actif', await boutonActif(page), 'jour');

  r.section('Un choix manuel de période n\'est pas écrasé');
  await page.evaluate(async () => {
    document.getElementById('search-input').value = 'martin';
    renderHistoryDebounced();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => setHistPeriode('mois'));      // choix explicite
  await page.waitForTimeout(150);
  await page.evaluate(async () => {
    document.getElementById('search-input').value = '';
    renderHistoryDebounced();
  });
  await page.waitForTimeout(400);
  r.check('reste sur « mois » (choix respecté)', await page.evaluate(() => _histPeriode), 'mois');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

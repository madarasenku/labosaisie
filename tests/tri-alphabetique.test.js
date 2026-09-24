// ✅ v13.203 — Menu « Tri » : option ordre alphabétique (Nom A→Z / Z→A), en
// plus de Date et Montant. Le menu pilote colonne + sens.
const { serve, openApp, createReporter } = require('./helpers');

// Lit la suite des noms de patients affichés (colonne « Patient »).
const noms = page => page.evaluate(() =>
  [...document.querySelectorAll('#history-body tr')]
    .filter(tr => tr.querySelectorAll('td').length > 1)
    .map(tr => (tr.querySelector('td[data-label="Patient"]')?.textContent || '').trim().toLowerCase())
    .filter(Boolean));

const choisirTri = (page, v) => page.evaluate(x => {
  const s = document.getElementById('filter-sort');
  s.value = x; appliquerTriHistorique();
}, v);

const estCroissant = a => a.every((x, i) => i === 0 || a[i - 1] <= x);

(async () => {
  const srv = await serve();
  const r = createReporter('TRI — ORDRE ALPHABÉTIQUE');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  await page.evaluate(() => { showView('historique'); setHistPeriode('tout'); });
  await page.waitForTimeout(1200);

  r.section('Options du menu « Tri »');
  const options = await page.evaluate(() =>
    [...document.querySelectorAll('#filter-sort option')].map(o => o.value));
  r.check('option Nom A → Z présente', options.includes('nom-asc'), true);
  r.check('option Nom Z → A présente', options.includes('nom-desc'), true);

  r.section('Nom A → Z');
  await choisirTri(page, 'nom-asc');
  await page.waitForTimeout(500);
  const asc = await noms(page);
  r.check('au moins 2 noms affichés', asc.length >= 2, true);
  r.check('noms triés en ordre croissant', estCroissant(asc), true);
  r.check('_sortCol = nom', await page.evaluate(() => _sortCol), 'nom');

  r.section('Nom Z → A');
  await choisirTri(page, 'nom-desc');
  await page.waitForTimeout(500);
  const desc = await noms(page);
  r.check('noms triés en ordre décroissant', estCroissant([...desc].reverse()), true);
  r.check('c\'est l\'inverse de A→Z', desc.join('|'), [...asc].reverse().join('|'));

  r.section('Retour au tri par date sans casse');
  await choisirTri(page, 'date-desc');
  await page.waitForTimeout(400);
  r.check('_sortCol = date', await page.evaluate(() => _sortCol), 'date');
  r.check('_sortDir = desc', await page.evaluate(() => _sortDir), 'desc');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

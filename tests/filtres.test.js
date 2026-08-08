// Filtres de l'Historique, des Statistiques et de la Caisse.
// Régression couverte : v13.68 — un mois passé était invisible dans les
// Ristournes parce que le cache ne contenait que la période de l'Historique.
const { serve, openApp, createReporter, histRows, setField, numeric, ATTENDU } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('FILTRES');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  const clearAll = async () => {
    await page.evaluate(() => { if (typeof clearSearchFilters === 'function') clearSearchFilters(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(600);
  };

  await page.evaluate(() => showView('historique'));
  await page.waitForTimeout(1200);
  await clearAll();

  r.section(`Historique — périodes (aujourd'hui = ${ATTENDU.aujourdhui})`);
  for (const [p, exp] of [['tout',ATTENDU.tout],['mois',ATTENDU.mois],
                          ['jour',ATTENDU.jour],['semaine',ATTENDU.semaine]]) {
    await page.evaluate(x => setHistPeriode(x), p);
    await page.waitForTimeout(700);
    r.check(`période « ${p} »`, await histRows(page), exp);
  }

  await clearAll();
  await setField(page, 'filter-date-from', ATTENDU.plageDe);
  await setField(page, 'filter-date-to',   ATTENDU.plageA);
  await page.evaluate(() => appliquerFiltreCustom());
  await page.waitForTimeout(800);
  r.check(`plage ${ATTENDU.plageDe} → ${ATTENDU.plageA}`, await histRows(page), ATTENDU.plage);

  r.section('Historique — critères');
  const cas = [
    ['filter-type',    'Hématologie',   4],
    ['filter-type',    'Parasitologie', 2],
    ['filter-agent',   'agent1',        5],
    ['filter-service', 'Maternité',     5],
    ['filter-statut',  'rendu',         5],
    ['filter-statut',  'urgent',        2],
  ];
  for (const [id, val, exp] of cas) {
    await clearAll();
    await setField(page, id, val);
    await page.waitForTimeout(650);
    r.check(`${id.replace('filter-','')} = ${val}`, await histRows(page), exp);
  }

  r.section('Historique — recherche texte');
  const search = async v => {
    await page.evaluate(x => {
      const e = document.getElementById('search-input')
             || document.querySelector('input[type="search"]');
      if (e) { e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }
    }, v);
    await page.waitForTimeout(800);
  };
  await clearAll(); await search('KOUAME');    r.check('« KOUAME »', await histRows(page), 3);
  await clearAll(); await search('BAMBA');     r.check('« BAMBA »',  await histRows(page), 2);
  await clearAll(); await search('Pédiatrie'); r.check('« Pédiatrie »', await histRows(page), 3);

  r.section('Historique — cumul de filtres');
  await clearAll();
  await setField(page, 'filter-type', 'Hématologie'); await page.waitForTimeout(400);
  await setField(page, 'filter-agent', 'agent1');     await page.waitForTimeout(700);
  r.check('type Hémato + agent1', await histRows(page), 3);
  await setField(page, 'filter-service', 'Maternité'); await page.waitForTimeout(700);
  r.check('+ service Maternité', await histRows(page), 2);
  await clearAll();
  r.check('réinitialisation', await histRows(page), ATTENDU.tout);

  r.section('Statistiques');
  await page.evaluate(() => showView('stats'));
  await page.waitForTimeout(1200);
  for (const [p, exp] of [['tout',ATTENDU.tout],['mois',ATTENDU.mois],
                          ['jour',ATTENDU.jour],['semaine',ATTENDU.semaine]]) {
    await page.evaluate(x => setStatsPeriode(x), p);
    await page.waitForTimeout(800);
    const n = await page.evaluate(() => {
      const { from, to } = getStatsDateRange();
      return filterByDateRange(getCalcDB(), from, to).length;
    });
    r.check(`période « ${p} »`, n, exp);
  }

  r.section('Caisse');
  await page.evaluate(() => showView('caisse'));
  await page.waitForTimeout(1200);
  for (const [p, nb, total] of [['mois', ATTENDU.caisseMois.nb, ATTENDU.caisseMois.total],
                                ['jour', ATTENDU.caisseJour.nb, ATTENDU.caisseJour.total]]) {
    await page.evaluate(x => setCaissePeriode(x), p);
    await page.waitForTimeout(1600);
    const t = numeric(await page.evaluate(() => document.getElementById('caisse-kpi-total').textContent));
    const n = numeric(await page.evaluate(() => document.getElementById('caisse-kpi-nb').textContent));
    r.check(`« ${p} » nb/total`, `${n}/${t}`, `${nb}/${total}`);
  }

  r.section('Ristournes — mois courant ET mois passé (régression v13.68)');
  const moisATester = [
    [ATTENDU.moisCourantNum,   ATTENDU.moisCourantAnnee,   ATTENDU.ristournesCourant],
    [ATTENDU.moisPrecedentNum, ATTENDU.moisPrecedentAnnee, ATTENDU.ristournesPrecedent],
  ];
  for (const [m, annee, att] of moisATester) {
    const d = await page.evaluate(([mm, aa]) => JSON.stringify(
      computeRistournesData(mm, aa).map(x => ({ nb:x.nb, brut:x.montantBrut }))), [m, annee]);
    r.check(`ristournes ${m}/${annee}`, d, JSON.stringify([{ nb: att.nb, brut: att.total }]));
  }

  r.section('Modes admin');
  await page.evaluate(() => showView('historique')); await page.waitForTimeout(700);
  await page.evaluate(() => setHistPeriode('tout')); await page.waitForTimeout(700);
  await page.evaluate(() => toggleCorbeille());     await page.waitForTimeout(900);
  r.check('corbeille vide', await histRows(page), 0);
  await page.evaluate(() => toggleCorbeille());     await page.waitForTimeout(900);
  r.check('retour vue normale', await histRows(page), ATTENDU.tout);
  await page.evaluate(() => toggleVerrouillees());  await page.waitForTimeout(900);
  r.check('fiches verrouillées vides', await histRows(page), 0);
  await page.evaluate(() => toggleVerrouillees());  await page.waitForTimeout(900);
  r.check('retour vue normale', await histRows(page), ATTENDU.tout);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));

  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

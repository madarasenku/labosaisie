// Navigation dans le temps (v13.72) : flèches ◀ ▶ adaptatives et saut
// direct à un mois via les listes déroulantes.
//
// Le besoin : consulter le mois précédent imposait auparavant de saisir
// deux dates à la main dans les champs « Du … au … ».
const { serve, openApp, createReporter, histRows, ATTENDU, FICHES } = require('./helpers');

const compteMois = prefixe => FICHES.filter(f => f[1].startsWith(prefixe)).length;

(async () => {
  const srv = await serve();
  const r = createReporter('NAVIGATION PAR PÉRIODE');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  await page.evaluate(() => showView('historique'));
  await page.waitForTimeout(1500);

  const label = () => page.evaluate(() =>
    document.getElementById('hist-nav-label')?.textContent || '');
  const visible = id => page.evaluate(i => {
    const e = document.getElementById(i);
    return !!e && e.offsetParent !== null;
  }, id);

  r.section('Mois — flèche ◀ vers le mois précédent');
  await page.evaluate(() => setHistPeriode('mois'));
  await page.waitForTimeout(800);
  r.check('libellé du mois courant', await label(),
          new Date().toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
            .replace(/^./, c => c.toUpperCase()));
  r.check('fiches du mois courant', await histRows(page), ATTENDU.mois);

  await page.evaluate(() => decalerPeriode(-1));
  await page.waitForTimeout(900);
  r.check('fiches du mois précédent', await histRows(page),
          compteMois(ATTENDU.moisPrecedentPrefixe));
  r.check('le libellé a changé', (await label()).length > 3, true);
  r.check('bouton « Actuel » apparu', await visible('hist-nav-retour'), true);

  r.section('Le futur est interdit');
  await page.evaluate(() => retourPeriodeCourante());
  await page.waitForTimeout(800);
  r.check('retour au mois courant', await histRows(page), ATTENDU.mois);
  r.check('flèche ▶ désactivée sur le mois courant',
          await page.evaluate(() => document.getElementById('hist-nav-suivant').disabled), true);
  await page.evaluate(() => decalerPeriode(1));   // doit être sans effet
  await page.waitForTimeout(700);
  r.check('clic sur ▶ sans effet', await histRows(page), ATTENDU.mois);

  r.section('Aller-retour ◀ puis ▶');
  await page.evaluate(() => decalerPeriode(-1));
  await page.waitForTimeout(800);
  await page.evaluate(() => decalerPeriode(1));
  await page.waitForTimeout(800);
  r.check('on retrouve le mois courant', await histRows(page), ATTENDU.mois);
  r.check('bouton « Actuel » masqué', await visible('hist-nav-retour'), false);

  r.section('Semaine — les flèches passent au pas hebdomadaire');
  await page.evaluate(() => setHistPeriode('semaine'));
  await page.waitForTimeout(800);
  r.check('semaine en cours', await histRows(page), ATTENDU.semaine);
  r.check('libellé de semaine', /Semaine du /.test(await label()), true);
  const avant = await page.evaluate(() => JSON.stringify(getHistRange()));
  await page.evaluate(() => decalerPeriode(-1));
  await page.waitForTimeout(800);
  const apres = await page.evaluate(() => JSON.stringify(getHistRange()));
  r.check('la plage a reculé', avant !== apres, true);
  r.check('recul de 7 jours exactement', await page.evaluate(() => {
    const a = getHistRange();
    _histDecalage += 1; const b = getHistRange(); _histDecalage -= 1;
    return Math.round((new Date(b.from) - new Date(a.from)) / 86400000);
  }), 7);

  r.section('Jour — pas quotidien');
  await page.evaluate(() => setHistPeriode('jour'));
  await page.waitForTimeout(800);
  r.check("aujourd'hui", await histRows(page), ATTENDU.jour);
  r.check('libellé « Aujourd\'hui »', await label(), "Aujourd'hui");
  await page.evaluate(() => decalerPeriode(-1));
  await page.waitForTimeout(800);
  r.check('libellé « Hier »', await label(), 'Hier');

  r.section('Changer de granularité repart de la période en cours');
  await page.evaluate(() => setHistPeriode('mois'));
  await page.waitForTimeout(800);
  r.check('décalage remis à zéro', await page.evaluate(() => _histDecalage), 0);
  r.check('mois courant affiché', await histRows(page), ATTENDU.mois);

  r.section('Saut direct par les listes déroulantes');
  r.check('sélecteurs visibles en mode mois', await visible('hist-mois-annee'), true);
  const [mp, ap] = [ATTENDU.moisPrecedentNum - 1, ATTENDU.moisPrecedentAnnee];
  await page.evaluate(([m, a]) => {
    document.getElementById('hist-sel-mois').value = m;
    document.getElementById('hist-sel-annee').value = a;
    allerAuMois();
  }, [mp, ap]);
  await page.waitForTimeout(900);
  r.check('saut au mois précédent', await histRows(page),
          compteMois(ATTENDU.moisPrecedentPrefixe));

  await page.evaluate(() => setHistPeriode('tout'));
  await page.waitForTimeout(800);
  r.check('bandeau masqué en mode « Tout »', await visible('hist-nav-periode'), false);
  r.check('toutes les fiches', await histRows(page), ATTENDU.tout);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));

  await page.evaluate(() => setHistPeriode('mois'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/nav-periode.png' });

  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

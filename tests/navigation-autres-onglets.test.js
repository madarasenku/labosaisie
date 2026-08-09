// Navigation dans le temps sur les autres onglets filtrables (v13.73) :
// Statistiques, Caisse, et Caisse personnelle du rôle agent.
//
// Le composant est partagé (js/periode-nav.js) : ces tests vérifient que
// chaque onglet le branche correctement — le décalage doit rester propre à
// l'onglet, et le filtrage doit réellement suivre.
const { serve, openApp, createReporter, numeric, ATTENDU, FICHES } = require('./helpers');

const parMois = p => FICHES.filter(f => f[1].startsWith(p));
const moisPrec = parMois(ATTENDU.moisPrecedentPrefixe);
const agent1Prec = moisPrec.filter(f => f[4] === 'agent1');

(async () => {
  const srv = await serve();
  const r = createReporter('NAVIGATION — AUTRES ONGLETS');
  let erreurs = [];

  // ─────────────── STATISTIQUES ───────────────
  {
    const { ctx, page, errors } = await openApp({ role: 'admin' });
    await page.evaluate(() => showView('stats'));
    await page.waitForTimeout(1500);

    r.section('Statistiques');
    r.check('bandeau présent', await page.evaluate(
      () => !!document.getElementById('stats-nav-periode')), true);

    await page.evaluate(() => setStatsPeriode('mois'));
    await page.waitForTimeout(900);
    const nbCourant = await page.evaluate(() => {
      const { from, to } = getStatsDateRange();
      return filterByDateRange(getCalcDB(), from, to).length;
    });
    r.check('mois courant', nbCourant, ATTENDU.mois);
    r.check('libellé du mois', await page.evaluate(
      () => document.getElementById('stats-nav-label')?.textContent),
      new Date().toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
        .replace(/^./, c => c.toUpperCase()));

    await page.evaluate(() => decalerStats(-1));
    await page.waitForTimeout(900);
    r.check('mois précédent', await page.evaluate(() => {
      const { from, to } = getStatsDateRange();
      return filterByDateRange(getCalcDB(), from, to).length;
    }), moisPrec.length);
    r.check('▶ désactivée après retour', await page.evaluate(() => {
      retourStatsCourant();
      return document.getElementById('stats-nav-suivant').disabled;
    }), true);

    await page.evaluate(() => setStatsPeriode('tout'));
    await page.waitForTimeout(700);
    r.check('bandeau masqué en mode « Tout »', await page.evaluate(() => {
      const z = document.getElementById('stats-nav-periode');
      return z.offsetParent !== null;
    }), false);

    erreurs = erreurs.concat(errors);
    await ctx.close();
  }

  // ─────────────── CAISSE (admin) ───────────────
  {
    const { ctx, page, errors } = await openApp({ role: 'admin' });
    await page.evaluate(() => showView('caisse'));
    await page.waitForTimeout(1500);

    r.section('Caisse');
    r.check('bandeau présent', await page.evaluate(
      () => !!document.getElementById('caisse-nav-periode')), true);

    await page.evaluate(() => setCaissePeriode('mois'));
    await page.waitForTimeout(1800);
    r.check('mois courant — nb', numeric(await page.evaluate(
      () => document.getElementById('caisse-kpi-nb').textContent)), ATTENDU.caisseMois.nb);
    r.check('mois courant — total', numeric(await page.evaluate(
      () => document.getElementById('caisse-kpi-total').textContent)), ATTENDU.caisseMois.total);

    await page.evaluate(() => decalerCaisse(-1));
    await page.waitForTimeout(1800);
    r.check('mois précédent — nb', numeric(await page.evaluate(
      () => document.getElementById('caisse-kpi-nb').textContent)), moisPrec.length);
    r.check('mois précédent — total', numeric(await page.evaluate(
      () => document.getElementById('caisse-kpi-total').textContent)),
      moisPrec.reduce((s, f) => s + f[2], 0));
    r.check('bouton « Actuel » apparu', await page.evaluate(() => {
      const b = document.getElementById('caisse-nav-retour');
      return !!b && b.offsetParent !== null;
    }), true);

    // Les champs de dates doivent suivre la navigation.
    r.check('champs de dates synchronisés', await page.evaluate(
      () => document.getElementById('caisse-date-from')?.value?.slice(0, 7)),
      ATTENDU.moisPrecedentPrefixe);

    await page.evaluate(() => retourCaisseCourante());
    await page.waitForTimeout(1800);
    r.check('retour au mois courant', numeric(await page.evaluate(
      () => document.getElementById('caisse-kpi-nb').textContent)), ATTENDU.caisseMois.nb);

    r.section('Saut direct par les listes déroulantes (Caisse)');
    await page.evaluate(([m, a]) => {
      document.getElementById('caisse-sel-mois').value = m;
      document.getElementById('caisse-sel-annee').value = a;
      allerAuMoisCaisse();
    }, [ATTENDU.moisPrecedentNum - 1, ATTENDU.moisPrecedentAnnee]);
    await page.waitForTimeout(1800);
    r.check('saut au mois précédent', numeric(await page.evaluate(
      () => document.getElementById('caisse-kpi-nb').textContent)), moisPrec.length);

    erreurs = erreurs.concat(errors);
    await ctx.close();
  }

  // ─────────────── CAISSE PERSONNELLE (agent) ───────────────
  {
    const { ctx, page, errors } = await openApp({ role:'agent', username:'agent1', userId:2 });
    await page.evaluate(() => showView('caisse'));
    await page.waitForTimeout(1500);

    r.section('Caisse personnelle (agent)');
    r.check('bandeau présent', await page.evaluate(
      () => !!document.getElementById('ucaisse-nav-periode')), true);

    await page.evaluate(() => setUCaissePeriode('mois'));
    await page.waitForTimeout(1800);
    const agent1Courant = parMois(ATTENDU.moisCourantPrefixe).filter(f => f[4] === 'agent1');
    r.check('mois courant — nb', numeric(await page.evaluate(
      () => document.getElementById('ucaisse-kpi-nb').textContent)), agent1Courant.length);

    await page.evaluate(() => decalerUCaisse(-1));
    await page.waitForTimeout(1800);
    r.check('mois précédent — nb', numeric(await page.evaluate(
      () => document.getElementById('ucaisse-kpi-nb').textContent)), agent1Prec.length);
    r.check('mois précédent — total', numeric(await page.evaluate(
      () => document.getElementById('ucaisse-kpi-total').textContent)),
      agent1Prec.reduce((s, f) => s + f[2], 0));
    r.check('toujours cloisonné à ses fiches', await page.evaluate(
      () => getCalcDB().every(x => x.createdBy === 'agent1')), true);

    erreurs = erreurs.concat(errors);
    await ctx.close();
  }

  r.check('aucune erreur JS', erreurs.length, 0);
  if (erreurs.length) console.log('   ', erreurs.slice(0, 3));

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

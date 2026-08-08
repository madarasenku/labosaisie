// Cloisonnement par rôle : admin, caissier, agent.
// Vérifie qu'un agent ne voit que ses propres fiches et que le caissier
// n'a pas accès à la saisie.
const { serve, openApp, createReporter, numeric, FICHES, ATTENDU } = require('./helpers');

const parAgent = a => FICHES.filter(f => f[4] === a);
const agent1Mois = parAgent('agent1').filter(f => f[1].startsWith(ATTENDU.moisCourantPrefixe));

(async () => {
  const srv = await serve();
  const r = createReporter('RÔLES');
  let allErrors = [];

  // ── Admin : voit tout ──────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({ role:'admin', username:'admin1' });
    r.section('Admin');
    r.check('isAdmin()', await page.evaluate(() => isAdmin()), true);
    r.check('fiches visibles (getCalcDB)', await page.evaluate(() => getCalcDB().length), FICHES.length);
    allErrors = allErrors.concat(errors);
    await ctx.close();
  }

  // ── Caissier : caisse complète, pas de saisie ──────────────────────
  {
    const { ctx, page, errors } = await openApp({ role:'caissier', username:'caissier1', userId:3 });
    r.section('Caissier');
    r.check('isCaissier()', await page.evaluate(() => isCaissier()), true);
    r.check('voit toutes les fiches', await page.evaluate(() => getCalcDB().length), FICHES.length);
    const nav = await page.evaluate(() => [...document.querySelectorAll('.nav-btn, .btn-header')]
      .filter(b => b.offsetParent !== null).map(b => b.textContent).join(' '));
    r.check('onglet « Nouvelle saisie » masqué', /Nouvelle saisie/.test(nav), false);
    r.check('onglet « Comptes » masqué',         /Comptes/.test(nav), false);
    r.check('onglet « Caisse » présent',         /Caisse/.test(nav), true);
    allErrors = allErrors.concat(errors);
    await ctx.close();
  }

  // ── Agent : uniquement ses fiches ──────────────────────────────────
  // agent1 possède 5 des 10 fiches. Les comptes sont dérivés de FICHES,
  // jamais écrits en dur : les dates du jeu de données bougent avec la
  // date du jour (voir l'avertissement en tête de helpers.js).
  {
    const { ctx, page, errors } = await openApp({ role:'agent', username:'agent1', userId:2 });
    r.section('Agent');
    r.check('isAdmin()',    await page.evaluate(() => isAdmin()), false);
    r.check('isCaissier()', await page.evaluate(() => isCaissier()), false);
    r.check('ne voit que ses fiches', await page.evaluate(() => getCalcDB().length), parAgent('agent1').length);
    r.check('aucune fiche d\'un autre agent', await page.evaluate(
      () => getCalcDB().every(x => x.createdBy === 'agent1')), true);

    await page.evaluate(() => showView('caisse'));
    await page.waitForTimeout(1200);
    await page.evaluate(() => setUCaissePeriode('mois'));
    await page.waitForTimeout(1600);
    const n = numeric(await page.evaluate(() => document.getElementById('ucaisse-kpi-nb').textContent));
    const t = numeric(await page.evaluate(() => document.getElementById('ucaisse-kpi-total').textContent));
    r.check('caisse perso mois courant (nb/total)', `${n}/${t}`,
            `${agent1Mois.length}/${agent1Mois.reduce((s, f) => s + f[2], 0)}`);
    allErrors = allErrors.concat(errors);
    await ctx.close();
  }

  r.check('aucune erreur JS', allErrors.length, 0);
  if (allErrors.length) console.log('   ', allErrors.slice(0, 3));

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

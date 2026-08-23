// ✅ v13.122 — Encaissement par un agent quand il n'y a pas de caissier.
//
// Règle : admin/caissier encaissent toujours ; un agent n'obtient la caisse
// complète (et le droit d'encaisser) QUE s'il n'existe aucun compte caissier
// (window._noCaissier === true, renseigné par caissier_exists au login).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('CAISSE — AGENT SANS CAISSIER');
  const srv = await serve(8114);
  let ctx;
  try {
    const app = await openApp({ role: 'agent', username: 'agent1', userId: 2, port: 8114,
      rpc: { get_tarifs: {}, get_examens_custom: [], caissier_exists: true } });
    ctx = app.ctx;
    const { page, errors } = app;

    r.section('Un caissier existe → agent NE peut pas encaisser');
    const avec = await page.evaluate(() => {
      window._noCaissier = false;
      showView('caisse');
      return {
        peut: peutEncaisser(),
        pleine: document.getElementById('view-caisse')?.style.display !== 'none',
        perso: document.getElementById('view-caisse-user')?.style.display !== 'none',
      };
    });
    r.check('peutEncaisser = false', avec.peut, false);
    r.check('caisse complète masquée', avec.pleine, false);
    r.check('vue caisse personnelle affichée', avec.perso, true);

    r.section('Aucun caissier → agent PEUT encaisser');
    const sans = await page.evaluate(() => {
      window._noCaissier = true;
      showView('historique'); showView('caisse'); // forcer un recalcul des vues
      return {
        peut: peutEncaisser(),
        pleine: document.getElementById('view-caisse')?.style.display !== 'none',
        perso: document.getElementById('view-caisse-user')?.style.display !== 'none',
      };
    });
    r.check('peutEncaisser = true', sans.peut, true);
    r.check('caisse complète affichée', sans.pleine, true);
    r.check('vue caisse personnelle masquée', sans.perso, false);

    r.section('Admin encaisse toujours (indépendant du caissier)');
    const adm = await page.evaluate(() => {
      _currentUser.role = 'admin';
      window._noCaissier = false;
      return peutEncaisser();
    });
    r.check('admin : peutEncaisser = true', adm, true);

    r.section('Spectateur n\'encaisse jamais');
    const spec = await page.evaluate(() => {
      _currentUser.role = 'spectateur';
      window._noCaissier = true;
      return peutEncaisser();
    });
    r.check('spectateur : peutEncaisser = false', spec, false);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
})();

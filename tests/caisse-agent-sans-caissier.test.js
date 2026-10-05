// ✅ v13.122 / v13.225 — Droit d'encaissement et accès à la caisse selon le rôle.
//
// v13.225 découple deux notions (demande « tous les agents puissent encaisser
// pour le moment ») :
//   • peutEncaisser()  = droit de PRENDRE UN PAIEMENT. Élargi : tous les rôles
//     sauf spectateur et prescripteur, même quand un caissier existe. L'agent
//     encaisse depuis l'historique (badge « Non payé », encaissement groupé).
//   • tientLaCaisse()  = CAISSE COMPLÈTE (tableau de bord + clôture/verrouillage,
//     réouvrable par l'admin seul). Réservé à admin/caissier, ou à un agent
//     uniquement s'il n'existe aucun caissier (window._noCaissier === true).
// Un agent ordinaire peut donc encaisser SANS tenir la caisse (vue simplifiée).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('CAISSE — ENCAISSEMENT vs TENUE DE CAISSE');
  const srv = await serve(8114);
  let ctx;
  try {
    const app = await openApp({ role: 'agent', username: 'agent1', userId: 2, port: 8114,
      rpc: { get_tarifs: {}, get_examens_custom: [], caissier_exists: true } });
    ctx = app.ctx;
    const { page, errors } = app;

    r.section('Un caissier existe → l\'agent encaisse mais ne tient pas la caisse');
    const avec = await page.evaluate(() => {
      window._noCaissier = false;
      showView('historique'); showView('caisse');
      return {
        peut: peutEncaisser(),
        tient: tientLaCaisse(),
        pleine: document.getElementById('view-caisse')?.style.display !== 'none',
        perso: document.getElementById('view-caisse-user')?.style.display !== 'none',
      };
    });
    r.check('peutEncaisser = true (peut prendre un paiement)', avec.peut, true);
    r.check('tientLaCaisse = false (pas la caisse complète)', avec.tient, false);
    r.check('caisse complète masquée', avec.pleine, false);
    r.check('vue caisse personnelle affichée', avec.perso, true);

    r.section('Aucun caissier → l\'agent tient la caisse complète');
    const sans = await page.evaluate(() => {
      window._noCaissier = true;
      showView('historique'); showView('caisse'); // forcer un recalcul des vues
      return {
        peut: peutEncaisser(),
        tient: tientLaCaisse(),
        pleine: document.getElementById('view-caisse')?.style.display !== 'none',
        perso: document.getElementById('view-caisse-user')?.style.display !== 'none',
      };
    });
    r.check('peutEncaisser = true', sans.peut, true);
    r.check('tientLaCaisse = true', sans.tient, true);
    r.check('caisse complète affichée', sans.pleine, true);
    r.check('vue caisse personnelle masquée', sans.perso, false);

    r.section('Admin : encaisse et tient toujours la caisse');
    const adm = await page.evaluate(() => {
      _currentUser.role = 'admin';
      window._noCaissier = false;
      return { peut: peutEncaisser(), tient: tientLaCaisse() };
    });
    r.check('admin : peutEncaisser = true', adm.peut, true);
    r.check('admin : tientLaCaisse = true', adm.tient, true);

    r.section('Spectateur : rien');
    const spec = await page.evaluate(() => {
      _currentUser.role = 'spectateur';
      window._noCaissier = true;
      return { peut: peutEncaisser(), tient: tientLaCaisse() };
    });
    r.check('spectateur : peutEncaisser = false', spec.peut, false);
    r.check('spectateur : tientLaCaisse = false', spec.tient, false);

    r.section('Prescripteur : pas d\'encaissement');
    const presc = await page.evaluate(() => {
      _currentUser.role = 'prescripteur';
      window._noCaissier = true;
      return peutEncaisser();
    });
    r.check('prescripteur : peutEncaisser = false', presc, false);

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

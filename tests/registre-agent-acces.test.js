// ✅ v13.210 — Le registre du jour est ouvert à TOUS les agents : sa carte est
// déplacée dans la vue caisse simplifiée (aperçu + impression), la clôture non.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8259);
  const r = createReporter('REGISTRE — ACCÈS AGENT');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'yerigue', port: 8259 });

  const res = await page.evaluate(async () => {
    window.refreshDB = async () => {};
    window.renderUserCaisse = () => {};
    window.renderRegistre = () => { window.__regRendu = true; };
    window.updateVerrouilleeBtn = () => {};
    _dbCache = [];
    await renderCaisse();
    const carte = document.getElementById('registre-card');
    return {
      parent: carte ? carte.parentElement.id : null,
      visible: carte ? carte.style.display !== 'none' : false,
      rendu: !!window.__regRendu,
      clotureCachee: (document.getElementById('cloture-card') || {}).style?.display,
    };
  });

  r.section('Carte registre dans la vue de l\'agent');
  r.check('registre déplacé dans view-caisse-user', res.parent, 'view-caisse-user');
  r.check('registre visible', res.visible, true);
  r.check('aperçu du registre rendu', res.rendu, true);
  r.check('clôture masquée pour l\'agent', res.clotureCachee, 'none');

  // Retour admin : la carte revient dans view-caisse.
  await ctx.close();
  const app2 = await openApp({ role: 'admin', username: 'admin', port: 8259 });
  const res2 = await app2.page.evaluate(async () => {
    window.refreshDB = async () => {};
    window.renderCloture = () => {};
    window.renderRegistre = () => {};
    window.updateVerrouilleeBtn = () => {};
    window.getCaisseRange = () => ({ from: null, to: null });
    window.filterByDateRange = () => [];
    _dbCache = [];
    try { await renderCaisse(); } catch (e) {}
    const carte = document.getElementById('registre-card');
    return carte ? carte.parentElement.id : null;
  });
  r.section('Retour caisse complète (admin)');
  r.check('registre revient dans view-caisse', res2, 'view-caisse');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await app2.ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

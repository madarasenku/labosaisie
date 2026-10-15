// ════════════════════════════════════════════════════════════════════
//  Aucun accès DIRECT aux tables Supabase (v13.241)
//    Toute lecture passe par une fonction RPC à jeton. La lecture directe
//    de labo_prescripteurs exposait téléphones et taux de ristourne à
//    quiconque possède la clé publique (elle est dans le code de la page).
//    On parcourt les écrans de chaque rôle et on relève les appels vers
//    /rest/v1/<table> (hors /rpc/).
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8310);
  const r = createReporter('AUCUN ACCÈS DIRECT AUX TABLES');
  let erreurs = [];
  for (const [role, username, userId] of [['admin', 'admin1', 1], ['agent', 'agent1', 2], ['caissier', 'caissier1', 3]]) {
    const { ctx, page, errors } = await openApp({ role, username, userId, port: 8310 });
    const directs = [];
    page.on('request', q => {
      const u = q.url();
      if (/\.supabase\.co\/rest\/v1\//.test(u) && !/\/rest\/v1\/rpc\//.test(u)) directs.push(u.split('/rest/v1/')[1]);
    });
    for (const v of ['saisie', 'historique', 'accueil', 'stats', 'caisse', 'comptes']) {
      await page.evaluate(v => { try { showView(v); } catch (e) {} }, v);
      await page.waitForTimeout(700);
    }
    // La liste des médecins (saisie) se remplit depuis get_prescripteurs.
    await page.evaluate(() => { try { refreshMedecinDatalist(); } catch (e) {} });
    await page.waitForTimeout(500);
    r.check(role + ' — appels directs aux tables', directs.length ? directs.join(', ') : 'aucun', 'aucun');
    if (role === 'admin') {
      r.check('liste des médecins remplie', await page.evaluate(() =>
        [...document.querySelectorAll('#medecin-datalist option')].some(o => o.value === 'Dr ALPHA')), true);
    }
    erreurs = erreurs.concat(errors);
    await ctx.close();
  }
  r.check('aucune erreur JS', erreurs.length, 0);
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

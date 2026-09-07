// ✅ v13.154 — Âge non saisi = INCONNU → profil ADULTE (pas « nouveau-né »).
// Régression signalée : un GB adulte normal (8, réf 4–10) était surligné « Bas »
// parce que l'âge vide devenait 0, classé « NN » (réf GB 9–30). On vérifie que
// sans âge le profil est ADULTE et que GB=8 est interprété « Normal ».
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('PROFIL — ÂGE INCONNU = ADULTE (GB 8 NORMAL)');
  const srv = await serve(8161);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8161 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(150);
    await page.evaluate(() => { try { ensurePanelBuilt('hema'); } catch (e) {} });

    r.section('Âge vide + sexe F');
    const res = await page.evaluate(() => {
      const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      setV('p_age', ''); setV('p_sexe', 'F');
      const prof = getPatientProfile();
      setV('v_gbc', '8');
      // Interprétation du GB telle qu'elle serait stockée à l'enregistrement.
      let interp = '';
      try { if (typeof onParamInputColored === 'function') onParamInputColored('gbc'); } catch (e) {}
      try { interp = getValColorInterp('gbc'); } catch (e) { interp = 'ERR:' + e.message; }
      return { tranche: prof.tranche, interp };
    });
    r.check('âge inconnu → tranche ADULTE', res.tranche, 'ADULTE');
    r.check('GB=8 non surligné (interp Normal/vide)', res.interp === 'Normal' || res.interp === '', true);
    if (!(res.interp === 'Normal' || res.interp === '')) console.log('   interp obtenue =', res.interp);

    r.section('Âge réel de nouveau-né conservé');
    const nn = await page.evaluate(() => {
      const el = document.getElementById('p_age'); if (el) el.value = '0.02';
      return getPatientProfile().tranche;
    });
    r.check('âge 0.02 → tranche NN', nn, 'NN');

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

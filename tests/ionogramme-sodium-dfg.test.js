// ✅ v13.197 — Deux règles du labo pour la saisie :
//   1) Ionogramme : le sodium n'est PAS attendu, il est toujours déduit du
//      chlore (Na = Cl / 0.72). Vrai dans le formulaire ET en série.
//   2) DFG : la clairance (CKD-EPI) est aussi calculée en saisie en série,
//      à partir de la créatinine (comme l'urée).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('IONOGRAMME (Na = Cl/0.72) + DFG EN SÉRIE');
  const srv = await serve(8178);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8178 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      try { ensurePanelBuilt('bio'); } catch (e) {}
      try { _locksDisabled = true; if (typeof applyExamLocks === 'function') applyExamLocks(); } catch (e) {}
    });
    await page.waitForTimeout(100);

    r.section('Formulaire — sodium déduit du chlore');
    const iono = await page.evaluate(() => {
      const cl = document.getElementById('v_cl');
      cl.value = '102'; cl.dispatchEvent(new Event('input', { bubbles: true }));
      const na1 = (document.getElementById('v_na') || {}).value;
      cl.value = ''; cl.dispatchEvent(new Event('input', { bubbles: true }));
      const na2 = (document.getElementById('v_na') || {}).value;
      return { na1, na2 };
    });
    r.check('Cl 102 → Na = round(102/0.72) = 142', iono.na1, '142');
    r.check('Chlore vidé → sodium vidé', iono.na2, '');

    r.section('Configuration de la série');
    const cfg = await page.evaluate(() => ({
      ionoLabel: GRILLE_EXAMS.iono.label,
      ionoCols: GRILLE_EXAMS.iono.cols.map(c => c.k),
      ionoHasPostSet: typeof GRILLE_EXAMS.iono.postSet === 'function',
      creaLabel: GRILLE_EXAMS.crea.label,
    }));
    r.check('série iono : pas de colonne Na', cfg.ionoCols.indexOf('na'), -1);
    r.check('série iono : colonnes K + Cl', cfg.ionoCols.join(','), 'k,cl');
    r.check('série iono : postSet (déduit le Na)', cfg.ionoHasPostSet, true);
    r.check('série créatinine : libellé mentionne le DFG', /DFG/.test(cfg.creaLabel), true);

    r.section('DFG calculé en série (via la créatinine)');
    const dfgSerie = await page.evaluate(() => {
      const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      setV('p_age', '45'); setV('p_age_unit', 'ans'); setV('p_sexe', 'M');
      setV('v_crea', '12');
      // Reproduit ce que fait la série après avoir posé la créatinine.
      try { GRILLE_EXAMS.crea.postSet(); } catch (e) { return { err: e.message }; }
      return {
        dfg: (document.getElementById('v_dfg') || {}).value || '',
        uree: (document.getElementById('v_uree') || {}).value || '',
      };
    });
    r.check('urée déduite (12/44≈0.27)', dfgSerie.uree, '0.27');
    r.check('DFG CKD-EPI calculé en série (=76)', /CKD-EPI 2021 : 76/.test(dfgSerie.dfg), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

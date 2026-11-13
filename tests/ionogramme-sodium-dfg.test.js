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

    r.section('Sodium saisi : accepté, jamais écrasé (v13.272)');
    const saisi = await page.evaluate(() => {
      const ev = el => el.dispatchEvent(new Event('input', { bubbles: true }));
      const cl = document.getElementById('v_cl'), na = document.getElementById('v_na');
      const set = (el, v) => { el.value = v; ev(el); };
      set(cl, ''); set(na, '');
      set(cl, '102'); const auto1 = na.value;            // vide → calculé
      set(cl, '106'); const auto2 = na.value;            // calculé → suit le chlore
      set(na, '138'); const saisi1 = na.value;           // saisie à la main
      set(cl, '110'); const saisi2 = na.value;           // chlore change : Na gardé
      set(cl, ''); const saisi3 = na.value;              // chlore vidé : Na gardé
      set(na, ''); set(cl, '100'); const relance = na.value;  // Na vidé → calcul de nouveau
      set(cl, ''); set(na, '');
      // dossier rechargé (valeur posée sans événement) : acceptée aussi
      na.value = '141'; set(cl, '99'); const charge = na.value;
      set(cl, ''); set(na, '');
      // série : colonne Na remplie → gardée ; vide → calculée
      GRILLE_EXAMS.iono.postSet(); const vide = na.value;
      cl.value = '102'; na.value = ''; GRILLE_EXAMS.iono.postSet(); const serieAuto = na.value;
      cl.value = '102'; na.value = '137'; GRILLE_EXAMS.iono.postSet(); const serieSaisi = na.value;
      // même valeur que l'ancien calcul, mais tapée : gardée (cas d'un autre patient en série)
      set(cl, ''); set(na, ''); set(cl, '102'); set(na, '142'); set(cl, '90'); const memeValeur = na.value;
      set(cl, ''); set(na, '');
      return { memeValeur, auto1, auto2, saisi1, saisi2, saisi3, relance, charge, vide, serieAuto, serieSaisi };
    });
    r.check('Na vide, Cl 102 → calculé (142)', saisi.auto1, '142');
    r.check('Na tapé = ancien calcul, Cl modifié → conservé', saisi.memeValeur, '142');
    r.check('Na calculé suit le chlore (106 → 147)', saisi.auto2, '147');
    r.check('Na saisi (138) accepté', saisi.saisi1, '138');
    r.check('Cl modifié → Na saisi conservé', saisi.saisi2, '138');
    r.check('Cl vidé → Na saisi conservé', saisi.saisi3, '138');
    r.check('Na vidé → calcul de nouveau (100 → 139)', saisi.relance, '139');
    r.check('Na rechargé d\'un dossier : conservé', saisi.charge, '141');
    r.check('série : tout vide → vide', saisi.vide, '');
    r.check('série : Na vide → calculé (142)', saisi.serieAuto, '142');
    r.check('série : Na saisi (137) → conservé', saisi.serieSaisi, '137');

    r.section('Configuration de la série');
    const cfg = await page.evaluate(() => ({
      ionoLabel: GRILLE_EXAMS.iono.label,
      ionoCols: GRILLE_EXAMS.iono.cols.map(c => c.k),
      ionoHasPostSet: typeof GRILLE_EXAMS.iono.postSet === 'function',
      creaLabel: GRILLE_EXAMS.crea.label,
    }));
    r.check('série iono : colonnes K + Cl + Na (facultatif)', cfg.ionoCols.join(','), 'k,cl,na');
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
        dfg: (document.getElementById('dfg_ckd') || {}).textContent || '',
        uree: (document.getElementById('v_uree') || {}).value || '',
      };
    });
    r.check('urée déduite (12/44≈0.27)', dfgSerie.uree, '0.27');
    r.check('DFG CKD-EPI calculé en série (=76)', /76 mL\/min/.test(dfgSerie.dfg), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

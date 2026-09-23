// ✅ v13.196 — Carte de calcul du DFG (clairance créatinine).
// La saisie du DFG regroupe les DONNÉES nécessaires (créatinine, âge, sexe,
// poids) et affiche DEUX techniques calculées en direct :
//   • CKD-EPI 2021 (sans poids)  • Cockcroft-Gault (avec poids)
// Exemple validé (spec) : créat 12 mg/L, 45 ans, homme, 70 kg
//   → CKD-EPI 76 mL/min/1,73m² ; Cockcroft 77,1 mL/min ; stade G2.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('DFG — CARTE DE CALCUL (CKD-EPI + COCKCROFT)');
  const srv = await serve(8177);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8177 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      try { ensurePanelBuilt('bio'); } catch (e) {}
      // État d'une vraie session de saisie (examen rénal payé) : sans cela le
      // verrou vide les cases non payées.
      try { _locksDisabled = true; if (typeof applyExamLocks === 'function') applyExamLocks(); } catch (e) {}
    });
    await page.waitForTimeout(100);

    r.section('La carte DFG expose les cases du calcul');
    const champs = await page.evaluate(() => ({
      crea: !!document.getElementById('dfg_crea'),
      age: !!document.getElementById('dfg_age'),
      sexe: !!document.getElementById('dfg_sexe'),
      poids: !!document.getElementById('dfg_poids'),
      ckd: !!document.getElementById('dfg_ckd'),
      cock: !!document.getElementById('dfg_cock'),
    }));
    r.check('case Créatinine présente', champs.crea, true);
    r.check('case Âge présente', champs.age, true);
    r.check('case Sexe présente', champs.sexe, true);
    r.check('case Poids présente', champs.poids, true);
    r.check('ligne CKD-EPI présente', champs.ckd, true);
    r.check('ligne Cockcroft présente', champs.cock, true);

    r.section('Homme 45 ans, 70 kg, créatinine 12 mg/L (saisie via le tableau rénal)');
    const res = await page.evaluate(() => {
      const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      setV('p_age', '45'); setV('p_age_unit', 'ans'); setV('p_sexe', 'M'); setV('p_poids', '70');
      const crea = document.getElementById('v_crea');
      crea.value = '12'; crea.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        ckd: (document.getElementById('dfg_ckd') || {}).textContent || '',
        cock: (document.getElementById('dfg_cock') || {}).textContent || '',
        hidden: (document.getElementById('v_dfg') || {}).value || '',
        mirroirCrea: (document.getElementById('dfg_crea') || {}).value || '',
        mirroirPoids: (document.getElementById('dfg_poids') || {}).value || '',
      };
    });
    r.check('CKD-EPI = 76 + stade G2', /76 mL\/min\/1,73 m² — .*G2/.test(res.ckd), true);
    r.check('Cockcroft = 77,1 + stade G2', /77,1 mL\/min — .*G2/.test(res.cock), true);
    r.check('valeur enregistrée (v_dfg) contient les 2 techniques',
            /CKD-EPI 2021 : 76 .*Cockcroft-Gault : 77,1/.test(res.hidden), true);
    r.check('la carte reflète la créatinine du tableau rénal', res.mirroirCrea, '12');
    r.check('la carte reflète le poids de la fiche', res.mirroirPoids, '70');
    if (!/76/.test(res.ckd)) console.log('   CKD obtenu =', res.ckd);

    r.section('Saisie directement dans la carte DFG');
    const viaCarte = await page.evaluate(() => {
      const setEvt = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
      // On repart de zéro : tout via les cases de la carte.
      document.getElementById('v_crea').value = '';
      setEvt('dfg_age', '45', 'input');
      setEvt('dfg_sexe', 'M', 'change');
      setEvt('dfg_poids', '70', 'input');
      setEvt('dfg_crea', '12', 'input');
      return {
        ckd: (document.getElementById('dfg_ckd') || {}).textContent || '',
        vcrea: (document.getElementById('v_crea') || {}).value || '',
        page: (document.getElementById('p_poids') || {}).value || '',
      };
    });
    r.check('CKD-EPI calculé depuis la carte = 76', /76 mL\/min/.test(viaCarte.ckd), true);
    r.check('la créatinine de la carte alimente le tableau rénal (v_crea)', viaCarte.vcrea, '12');
    r.check('le poids de la carte est persisté (p_poids)', viaCarte.page, '70');

    r.section('Sans poids → Cockcroft indisponible, CKD-EPI conservé');
    const sansPoids = await page.evaluate(() => {
      const setEvt = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
      setEvt('dfg_poids', '', 'input');
      return {
        ckd: (document.getElementById('dfg_ckd') || {}).textContent || '',
        cock: (document.getElementById('dfg_cock') || {}).textContent || '',
      };
    });
    r.check('CKD-EPI toujours calculé sans poids', /76 mL\/min/.test(sansPoids.ckd), true);
    r.check('Cockcroft signale le poids requis', /[Pp]oids requis/.test(sansPoids.cock), true);

    r.section('Créatinine effacée → DFG vidé');
    const vide = await page.evaluate(() => {
      const crea = document.getElementById('dfg_crea');
      crea.value = ''; crea.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        ckd: (document.getElementById('dfg_ckd') || {}).textContent || '',
        hidden: (document.getElementById('v_dfg') || {}).value || '',
      };
    });
    r.check('CKD-EPI remis à « — »', vide.ckd, '—');
    r.check('valeur enregistrée vidée', vide.hidden, '');

    // ✅ v13.198 — Régression : le DFG doit se saisir même quand l'examen
    // « Créatinine » n'est PAS coché (champ v_crea verrouillé et vidé). Avant,
    // la carte passait par v_crea et le verrou effaçait la valeur → DFG jamais
    // calculé (« je n'arrive pas à rentrer les données pour le dfg »).
    r.section('Créatinine non commandée (champ rénal verrouillé) → DFG saisissable');
    const verrou = await page.evaluate(() => {
      const setEvt = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
      // Simuler le verrou de l'examen créatinine non coché.
      const vc = document.getElementById('v_crea');
      if (vc) { vc.value = ''; if (typeof setFieldLocked === 'function') setFieldLocked(vc, true); }
      // Saisir tout dans la carte DFG.
      setEvt('dfg_age', '45', 'input');
      setEvt('dfg_sexe', 'M', 'change');
      setEvt('dfg_poids', '70', 'input');
      setEvt('dfg_crea', '12', 'input');
      return {
        ckd: (document.getElementById('dfg_ckd') || {}).textContent || '',
        cock: (document.getElementById('dfg_cock') || {}).textContent || '',
        hidden: (document.getElementById('v_dfg') || {}).value || '',
      };
    });
    r.check('DFG calculé malgré le champ créatinine verrouillé', /76 mL\/min/.test(verrou.ckd), true);
    r.check('Cockcroft calculé (=77,1)', /77,1 mL\/min/.test(verrou.cock), true);
    r.check('valeur DFG enregistrable (v_dfg rempli)', /CKD-EPI 2021 : 76/.test(verrou.hidden), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

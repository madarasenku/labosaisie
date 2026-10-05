// Montant du forfait BPN à la saisie.
//
// Bug réel (oct. 2026) : en cochant « Bilan prénatal complet (forfait) », le
// montant affiché/enregistré valait ≈ 62 000 au lieu de 20 000 — calcFicheTotal
// sommait le forfait (20 000) ET le plein tarif de chaque examen composant,
// parce que la mise à 0 des composants (applyBpnSections) était appliquée APRÈS
// la somme. On vérifie que le total vaut le forfait, et qu'un examen HORS forfait
// s'ajoute bien par-dessus.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8181);
  const r = createReporter('BPN — MONTANT FORFAITAIRE');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: 8181,
    rpc: { get_tarifs: {}, get_examens_custom: [] } });

  const sommeSave = () => page.evaluate(() => {
    let s = 0;
    getCatalogueComplet().forEach(ex => {
      const cb = document.getElementById(ex.id);
      if (cb && cb.checked) {
        const px = document.getElementById('px_' + ex.id);
        s += px ? (parseInt(px.value) || 0) : (ex.prix || 0);
      }
    });
    return s;
  });
  const preview = () => page.evaluate(() => {
    const m = document.getElementById('montant-preview');
    return m ? Number(m.dataset.montant) : null;
  });

  // ── BPN seul → forfait 20 000 ───────────────────────────────────────
  await page.evaluate(() => {
    const b = document.getElementById('ex_bpn'); b.checked = true;
    initBpnComposition();
  });
  r.section('BPN seul');
  r.check('montant affiché = forfait 20 000', await preview(), 20000);
  r.check('somme enregistrée = 20 000', await sommeSave(), 20000);

  // ── BPN + CRP (hors forfait) → 20 000 + 3 500 ───────────────────────
  await page.evaluate(() => {
    const c = document.getElementById('ex_crp'); c.checked = true;
    if (typeof syncExamRowState === 'function') syncExamRowState('ex_crp');
    calcFicheTotal();
  });
  r.section('BPN + CRP (examen hors forfait)');
  r.check('montant = 20 000 + 3 500', await preview(), 23500);
  r.check('somme enregistrée = 23 500', await sommeSave(), 23500);

  // ── BPN décoché → le forfait disparaît, les tarifs composants reviennent ──
  await page.evaluate(() => {
    const b = document.getElementById('ex_bpn'); b.checked = false;
    if (typeof initBpnComposition === 'function') initBpnComposition();
    calcFicheTotal();
  });
  r.section('BPN décoché');
  // Les composants restent cochés mais retrouvent leur tarif ; le forfait (20 000)
  // disparaît. On vérifie seulement que le total n'est plus le forfait seul et
  // qu'il n'y a pas d'erreur (la composition exacte dépend de ce qui reste coché).
  const apres = await preview();
  r.check('plus le forfait seul (recalcul propre)', apres !== 20000, true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

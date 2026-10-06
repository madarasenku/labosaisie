// ✅ v13.228 — BPN : « Ag HBs » = ANTIGÈNE SEUL (pas d'Ac anti-HBs / anti-HBc),
// et un composant non réalisé reste DÉCOCHABLE (le forfait n'y touche plus).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8291);
  const r = createReporter('BPN — Ag HBs SEUL + composant décochable');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: 8291,
    rpc: { get_tarifs: {}, get_examens_custom: [] } });

  r.section('« Ag HBs » = antigène seul (examFieldIds)');
  const fids = await page.evaluate(() => examFieldIds('ex_hbs'));
  r.check('contient le champ Ag HBs', fids.includes('sr_hbsag'), true);
  r.check('PAS de champ Ac anti-HBs', fids.some(f => /hbsac/.test(f)), false);
  r.check('PAS de champ Ac anti-HBc', fids.some(f => /hbcac/.test(f)), false);

  r.section('Saisie « tout sur une page » : lignes anti-HBs/anti-HBc masquées');
  const vis = await page.evaluate(() => {
    if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt('sero');
    // Seul « Ag HBs » coché (comme dans un BPN).
    const hbs = document.getElementById('ex_hbs'); if (hbs) hbs.checked = true;
    ['ex_hbsac', 'ex_hbcac'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = false; });
    if (typeof hideUncheckedExamRows === 'function') hideUncheckedExamRows();
    const rowHidden = dom => { const el = document.getElementById(dom); const tr = el && el.closest('tr'); return tr ? tr.style.display === 'none' : null; };
    return { agVisible: rowHidden('sr_hbsag') === false, hbsacHidden: rowHidden('sv_hbsac'), hbcacHidden: rowHidden('sr_hbcac') };
  });
  r.check('ligne Ag HBs visible', vis.agVisible, true);
  r.check('ligne Ac anti-HBs masquée', vis.hbsacHidden, true);
  r.check('ligne Ac anti-HBc masquée', vis.hbcacHidden, true);

  r.section('Composant BPN décochable (électrophorèse) sans perdre le forfait');
  const etat = await page.evaluate(() => {
    // Repartir propre.
    getCatalogueComplet().forEach(ex => { const c = document.getElementById(ex.id); if (c) c.checked = false; });
    const bpn = document.getElementById('ex_bpn'); bpn.checked = true;
    initBpnComposition();                       // coche la composition par défaut
    const ephbAvant = !!document.getElementById('ex_ephb')?.checked;
    // L'utilisateur décoche l'électrophorèse (patient qui ne la fait pas).
    const e = document.getElementById('ex_ephb'); e.checked = false;
    if (typeof syncExamRowState === 'function') syncExamRowState('ex_ephb');
    calcFicheTotal();                           // ne doit PAS re-cocher l'électro
    return {
      ephbAvant,
      ephbApres: !!document.getElementById('ex_ephb')?.checked,
      bpnTjrs: !!document.getElementById('ex_bpn')?.checked,
      total: Number(document.getElementById('montant-preview').dataset.montant),
    };
  });
  r.check('électrophorèse cochée par défaut', etat.ephbAvant, true);
  r.check('électrophorèse reste DÉCOCHÉE', etat.ephbApres, false);
  r.check('forfait BPN toujours actif', etat.bpnTjrs, true);
  r.check('total = forfait 20 000', etat.total, 20000);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 4));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

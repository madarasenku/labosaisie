// ✅ v13.208 — Changer le PROPRIÉTAIRE en lot (dossiers cochés, admin).
// Réutilise la RPC changer_auteur_dossier, appliquée à chaque dossier coché.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('CHANGER PROPRIÉTAIRE EN LOT');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin' });

  const res = await page.evaluate(async () => {
    window.__calls = [];
    _sb = { rpc: async (n, p) => { window.__calls.push({ n, p }); return { data: { ok: true }, error: null }; } };
    _dbCache = [
      { id: 11, createdBy: 'nadia', patient: { nom: 'A', dossier: 'D11' } },
      { id: 12, createdBy: 'admin', patient: { nom: 'B', dossier: 'D12' } },
      { id: 13, createdBy: 'YERIGUE', patient: { nom: 'C', dossier: 'D13' } },
    ];
    _selectedIds = new Set([11, 12]);
    bulkChangerAuteur();                        // ouvre la modale
    document.getElementById('ba_author').value = 'YERIGUE';
    await submitBulkAuteur();
    const calls = window.__calls.filter(c => c.n === 'changer_auteur_dossier');
    return {
      nb: calls.length,
      auteurs: calls.map(c => c.p.p_nouvel_auteur),
      ids: calls.map(c => c.p.p_id).sort((a, b) => a - b),
      cache11: _dbCache.find(x => x.id === 11).createdBy,
      cache12: _dbCache.find(x => x.id === 12).createdBy,
      cache13: _dbCache.find(x => x.id === 13).createdBy,
    };
  });

  r.section('Réattribution en lot des dossiers cochés');
  r.check('2 dossiers traités', res.nb, 2);
  r.check('sur les bons dossiers (#11, #12)', res.ids.join(','), '11,12');
  r.check('tous → YERIGUE', res.auteurs.every(a => a === 'YERIGUE'), true);
  r.check('#11 mis à jour localement', res.cache11, 'YERIGUE');
  r.check('#12 mis à jour localement', res.cache12, 'YERIGUE');
  r.check('#13 non coché → inchangé', res.cache13, 'YERIGUE');

  r.section('YERIGUE présélectionné dans la liste');
  const presel = await page.evaluate(() => {
    _selectedIds = new Set([11]);
    bulkChangerAuteur();
    return document.getElementById('ba_author').value;
  });
  r.check('valeur par défaut = YERIGUE', presel, 'YERIGUE');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

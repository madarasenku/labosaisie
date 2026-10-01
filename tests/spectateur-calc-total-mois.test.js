// ✅ v13.209 — Les spectateurs ont le même total (caisse/stats) que l'admin.
// getCalcDB() spectateur inclut les dossiers nadia/admin pour cohérence financière.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('SPECTATEUR TOTAL MOIS = ADMIN');
  const { ctx, page, errors } = await openApp({ role: 'spectateur', username: 'spectateur' });

  const res = await page.evaluate(() => {
    _dbCache = [
      { id: 1, createdBy: 'YERIGUE',  patient: { nom: 'A', dossier: 'D1'  }, montant: 5000,  deletedAt: null, _hardDeleted: false },
      { id: 2, createdBy: 'nadia',    patient: { nom: 'B', dossier: 'D2'  }, montant: 3000,  deletedAt: null, _hardDeleted: false },
      { id: 3, createdBy: 'admin',    patient: { nom: 'C', dossier: 'D3'  }, montant: 2000,  deletedAt: null, _hardDeleted: false },
      { id: 4, createdBy: 'Mr ago Thierry', patient: { nom: 'D', dossier: 'D4' }, montant: 4000, deletedAt: null, _hardDeleted: false },
    ];
    const calcDB = getCalcDB();
    const total = calcDB.reduce((s, r) => s + (r.montant || 0), 0);
    const ids = calcDB.map(r => r.id).sort((a, b) => a - b);
    return { total, ids, count: calcDB.length };
  });

  r.section('getCalcDB() spectateur inclut tous les dossiers vivants');
  r.check('4 dossiers dans le calcul', res.count, 4);
  r.check('total = 14000 (inclut nadia + admin)', res.total, 14000);
  r.check('dossiers nadia (#2) inclus', res.ids.includes(2), true);
  r.check('dossiers admin (#3) inclus', res.ids.includes(3), true);

  r.section('getDB() spectateur cache toujours nadia/admin');
  const visible = await page.evaluate(() => {
    const db = getDB();
    return { ids: db.map(r => r.id).sort((a, b) => a - b), count: db.length };
  });
  r.check('2 dossiers visibles (YERIGUE + Mr ago)', visible.count, 2);
  r.check('nadia (#2) invisible dans historique', visible.ids.includes(2), false);
  r.check('admin (#3) invisible dans historique', visible.ids.includes(3), false);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

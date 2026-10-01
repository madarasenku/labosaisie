// ✅ v13.213 — Masquage : un dossier masqué sort de l'historique courant pour
// TOUTE l'équipe (y compris le masqueur), reste retrouvable dans la vue
// « Masqués » par tous les non-spectateurs, et est exclu des calculs. Le
// spectateur n'a jamais accès aux masqués. Démasquer = auteur ou admin.
const { serve, openApp, createReporter } = require('./helpers');

const faireCache = () => ([
  { id: 1, createdBy: 'agentA', montant: 5000, patient: { nom: 'LIBRE' }, restrictedBy: null,  deletedAt: null, _hardDeleted: false },
  { id: 2, createdBy: 'agentA', montant: 7000, patient: { nom: 'MASQUE' }, restrictedBy: 'agentA', deletedAt: null, _hardDeleted: false },
]);

(async () => {
  const srv = await serve(8275);
  const r = createReporter('MASQUAGE — PARTAGÉ EN ÉQUIPE');

  const vue = async (role, username) => {
    const { ctx, page, errors } = await openApp({ role, username, port: 8275 });
    const out = await page.evaluate((rows) => {
      _dbCache = rows;
      _filterVerrouillees = false; _filterCorbeille = false;
      const normal = getDB().map(r => r.id).sort();
      _filterVerrouillees = true;
      const masques = getDB().map(r => r.id).sort();
      _filterVerrouillees = false;
      const calc = (typeof getCalcDB === 'function' ? getCalcDB() : []).map(r => r.id).sort();
      return { normal, masques, calc };
    }, faireCache());
    await ctx.close();
    return { ...out, errors: errors.length };
  };

  const B = await vue('agent', 'agentB');       // un autre agent
  r.section('Autre agent (agentB)');
  r.check('historique courant : pas le masqué (#1 seul)', B.normal.join(','), '1');
  r.check('vue Masqués : voit le masqué (#2)', B.masques.join(','), '2');
  r.check('calculs : masqué #2 jamais compté', B.calc.includes(2), false);

  const A = await vue('agent', 'agentA');       // le masqueur
  r.section('Masqueur (agentA)');
  r.check('historique courant : pas son masqué (#1 seul)', A.normal.join(','), '1');
  r.check('vue Masqués : retrouve #2', A.masques.join(','), '2');
  r.check('calculs agentA : son #1 compté, #2 masqué exclu', A.calc.join(','), '1');

  const AD = await vue('admin', 'admin');
  r.section('Admin');
  r.check('historique : pas le masqué (#1)', AD.normal.join(','), '1');
  r.check('vue Masqués : voit #2', AD.masques.join(','), '2');

  const SP = await vue('spectateur', 'obs');
  r.section('Spectateur');
  r.check('vue Masqués vide', SP.masques.join(','), '');

  r.check('aucune erreur JS', B.errors + A.errors + AD.errors + SP.errors, 0);
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

// ✅ v13.204 — Visibilité par AUTEUR.
// • Spectateur : voit tout (non masqué / non supprimé) SAUF les dossiers de
//   « nadia » et « admin » — immédiatement, sans attendre la clôture.
// • Agent / caissier / admin : voient toujours nadia/admin (rien ne change pour eux).
// • L'admin peut changer l'auteur d'un dossier (RPC changer_auteur_dossier).
const { serve, openApp, createReporter } = require('./helpers');

const JEU = () => ([
  { id: 1, createdBy: 'YERIGUE',        patient: { nom: 'A', date: '2026-09-24', dossier: 'D1' } },
  { id: 2, createdBy: 'nadia',          patient: { nom: 'B', date: '2026-09-24', dossier: 'D2' } },
  { id: 3, createdBy: 'admin',          patient: { nom: 'C', date: '2026-09-24', dossier: 'D3' } },
  { id: 4, createdBy: 'YERIGUE', restrictedBy: 'admin', patient: { nom: 'D', date: '2026-09-24', dossier: 'D4' } }, // masqué
  { id: 5, createdBy: 'YERIGUE', deletedAt: '2026-09-24T09:00:00Z', patient: { nom: 'E', date: '2026-09-24', dossier: 'D5' } }, // supprimé
  { id: 6, createdBy: 'Mr ago Thierry', patient: { nom: 'F', date: '2026-09-24', dossier: 'D6' } },
]);

const idsVus = (page, jeu) => page.evaluate(d => { _dbCache = d; return getDB().map(r => r.id).sort((a, b) => a - b); }, jeu);

(async () => {
  const srv = await serve();
  const r = createReporter('VISIBILITÉ PAR AUTEUR (SPECTATEUR)');

  // ── Spectateur ───────────────────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({ role: 'spectateur', username: 'Tom' });
    const vus = await idsVus(page, JEU());
    r.section('Spectateur : équipe visible, sauf nadia/admin, sauf masqué/supprimé');
    r.check('voit YERIGUE (#1) et Mr ago Thierry (#6)', vus.join(','), '1,6');
    r.check('ne voit PAS nadia (#2)', vus.includes(2), false);
    r.check('ne voit PAS admin (#3)', vus.includes(3), false);
    r.check('ne voit PAS le masqué (#4)', vus.includes(4), false);
    r.check('ne voit PAS le supprimé (#5)', vus.includes(5), false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Admin : voit nadia/admin (non masqué/non supprimé) ────────────
  {
    const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin' });
    const vus = await idsVus(page, JEU());
    r.section('Admin : voit nadia et admin (mais ni masqué ni supprimé)');
    r.check('voit 1,2,3,6', vus.join(','), '1,2,3,6');
    // RPC changer_auteur_dossier appelée avec les bons paramètres
    const appel = await page.evaluate(async () => {
      window.__c = [];
      _sb = { rpc: async (n, p) => { window.__c.push({ n, p }); return { data: { ok: true }, error: null }; } };
      _dbCache = [{ id: 2, createdBy: 'nadia',   patient: { nom: 'B', dossier: 'D2' } },
                  { id: 9, createdBy: 'YERIGUE', patient: { nom: 'Z', dossier: 'D9' } }];
      window.showConfirmModal = async () => true;
      changerAuteurDossier(2);
      document.getElementById('ca_author').value = 'YERIGUE';
      await submitChangerAuteur();
      const c = window.__c.find(x => x.n === 'changer_auteur_dossier');
      return { id: c && c.p.p_id, auteur: c && c.p.p_nouvel_auteur,
               cacheApres: _dbCache.find(x => x.id === 2).createdBy };
    });
    r.check('RPC appelée sur le dossier #2', appel.id, 2);
    r.check('nouvel auteur = YERIGUE', appel.auteur, 'YERIGUE');
    r.check('auteur mis à jour localement', appel.cacheApres, 'YERIGUE');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Agent : voit aussi nadia/admin (+ ses propres masqués) ────────
  {
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'YERIGUE' });
    const vus = await idsVus(page, JEU());
    r.section('Agent YERIGUE : voit nadia/admin et son propre masqué');
    r.check('voit 1,2,3,4,6 (pas le supprimé #5)', vus.join(','), '1,2,3,4,6');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

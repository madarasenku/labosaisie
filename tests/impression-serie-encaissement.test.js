// ✅ v13.210 — Impression EN SÉRIE bloquée sans encaissement : la grille
// n'imprime que les dossiers encaissés (anti-contournement de la caisse).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8256);
  const r = createReporter('IMPRESSION SÉRIE — ENCAISSEMENT REQUIS');

  // ── Agent : seuls les dossiers payés sont imprimés ──────────────────
  {
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'yerigue', port: 8256 });
    const res = await page.evaluate(async () => {
      window.__printed = null;
      window.printLot = async (recs) => { window.__printed = recs.map(x => x.id); };
      window.ensureFull = async () => {};
      window.grilleSourceDB = () => _dbCache;
      window.toast = () => {};
      _dbCache = [
        { id: 61, patient: { nom: 'A', paiement_status: 'paye' } },
        { id: 62, patient: { nom: 'B', paiement_status: 'non_paye' } },
        { id: 63, patient: { nom: 'C', paiement_status: 'paye' } },
      ];
      _grilleDernierLot = [61, 62, 63];
      await grilleImprimerLot();
      return { printed: window.__printed };
    });
    r.section('Agent');
    r.check('imprime seulement les payés (#61, #63)', (res.printed || []).join(','), '61,63');

    const aucun = await page.evaluate(async () => {
      window.__printed = null;
      window.__toasts = [];
      window.toast = (m) => window.__toasts.push(String(m));
      _dbCache = [{ id: 71, patient: { nom: 'X', paiement_status: 'non_paye' } }];
      _grilleDernierLot = [71];
      await grilleImprimerLot();
      return { printed: window.__printed, bloc: (window.__toasts.find(m => /bloqu/i.test(m)) || '') };
    });
    r.check('aucun payé → rien imprimé', aucun.printed, null);
    r.check('message « bloquée » affiché', /bloqu/i.test(aucun.bloc), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Admin : imprime tout (réimpression, corrections) ────────────────
  {
    const { ctx, page } = await openApp({ role: 'admin', username: 'admin', port: 8256 });
    const res = await page.evaluate(async () => {
      window.__printed = null;
      window.printLot = async (recs) => { window.__printed = recs.map(x => x.id); };
      window.ensureFull = async () => {};
      window.grilleSourceDB = () => _dbCache;
      window.toast = () => {};
      _dbCache = [
        { id: 81, patient: { nom: 'A', paiement_status: 'paye' } },
        { id: 82, patient: { nom: 'B', paiement_status: 'non_paye' } },
      ];
      _grilleDernierLot = [81, 82];
      await grilleImprimerLot();
      return { printed: window.__printed };
    });
    r.section('Admin');
    r.check('admin imprime tout (#81, #82)', (res.printed || []).join(','), '81,82');
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

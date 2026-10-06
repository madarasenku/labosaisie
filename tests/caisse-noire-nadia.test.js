// ✅ v13.211 — La CAISSE NOIRE (ex « cahier noir ») est visible par le compte
// nadia ET l'administrateur (qui voit tout) ; refusée aux autres agents, au
// caissier et au spectateur.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8270);
  const r = createReporter('CAISSE NOIRE — NADIA + ADMIN');

  // ── nadia et admin : accès (bouton visible, action autorisée) ───────
  for (const compte of [
    { role: 'agent', username: 'nadia', label: 'nadia' },
    { role: 'admin', username: 'admin', label: 'admin' },
  ]) {
    const { ctx, page, errors } = await openApp({ role: compte.role, username: compte.username, port: 8270 });
    const res = await page.evaluate(async () => {
      window.__toasts = []; window.toast = (m) => window.__toasts.push(String(m));
      window.showConfirmModal = async () => true;
      _sb.rpc = async (n) => {
        if (n === 'get_cahier_noir') return { data: { mois: '2026-10', colonnes: [{ id: 1, libelle: 'DIVERS', archivee: false }], ecritures: [] }, error: null };
        return { data: { ok: true }, error: null };
      };
      _dbCache = [{ id: 1, montant: 5000, savedAt: '2026-10-01T09:00:00Z', patient: { nom: 'A', dossier: 'D1', date: '2026-10-01' } }];
      _selectedIds = new Set([1]);
      _filterCorbeille = false;
      renderHistory();
      const btn = document.getElementById('bulk-cahier-noir-btn');
      await bulkCahierNoir();
      const bloque = window.__toasts.some(m => /réservée/i.test(m));
      return { acces: accesCaisseNoire(), btnVisible: btn && btn.style.display !== 'none', bloque };
    });
    r.section('Compte ' + compte.label + ' (autorisé)');
    r.check('accesCaisseNoire = true', res.acces, true);
    r.check('bouton caisse noire visible', res.btnVisible, true);
    r.check('action NON bloquée', res.bloque, false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── autres comptes : refusés ────────────────────────────────────────
  for (const compte of [
    { role: 'agent', username: 'yerigue', label: 'autre agent' },
    { role: 'caissier', username: 'caisse', label: 'caissier' },
    { role: 'spectateur', username: 'obs', label: 'spectateur' },
  ]) {
    const { ctx, page } = await openApp({ role: compte.role, username: compte.username, port: 8270 });
    const res = await page.evaluate(async () => {
      window.__toasts = []; window.toast = (m) => window.__toasts.push(String(m));
      _dbCache = [{ id: 1, montant: 5000, patient: { nom: 'A', dossier: 'D1' } }];
      _selectedIds = new Set([1]); _filterCorbeille = false;
      renderHistory();
      const btn = document.getElementById('bulk-cahier-noir-btn');
      await bulkCahierNoir();
      return { acces: accesCaisseNoire(), btnVisible: btn && btn.style.display !== 'none',
               porte: window.__toasts.some(m => /porté/i.test(m)) };
    });
    r.section('Compte ' + compte.label + ' (refusé)');
    r.check('accesCaisseNoire = false', res.acces, false);
    r.check('bouton caisse noire masqué', res.btnVisible, false);
    r.check('aucun report effectué', res.porte, false);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

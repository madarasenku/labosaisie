// ✅ v13.211 / v13.231 — La CAISSE NOIRE (cahier noir) :
//   • LECTURE : nadia ET l'administrateur (les deux voient le cahier) ;
//   • ÉCRITURE (porter un dossier, ajouter/modifier/supprimer) : ADMIN UNIQUEMENT.
//     nadia est en LECTURE SEULE ; les autres agents, le caissier et le
//     spectateur n'y ont pas accès du tout.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8270);
  const r = createReporter('CAISSE NOIRE — ADMIN écrit, nadia lit');

  // ── ADMIN : lecture + écriture (bouton « porter » visible, action autorisée) ──
  {
    const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8270 });
    const res = await page.evaluate(async () => {
      window.__toasts = []; window.toast = (m) => window.__toasts.push(String(m));
      window.showConfirmModal = async () => true;
      _sb.rpc = async (n) => {
        if (n === 'get_cahier_noir') return { data: { mois: '2026-10', colonnes: [{ id: 1, libelle: 'DIVERS', archivee: false }], ecritures: [], lecture_seule: false }, error: null };
        return { data: { ok: true }, error: null };
      };
      _dbCache = [{ id: 1, montant: 5000, savedAt: '2026-10-01T09:00:00Z', patient: { nom: 'A', dossier: 'D1', date: '2026-10-01' } }];
      _selectedIds = new Set([1]); _filterCorbeille = false;
      renderHistory();
      const btn = document.getElementById('bulk-cahier-noir-btn');
      await bulkCahierNoir();
      return { acces: accesCaisseNoire(), btnVisible: btn && btn.style.display !== 'none',
               bloque: window.__toasts.some(m => /réservée/i.test(m)) };
    });
    r.section('Admin (lecture + écriture)');
    r.check('accès caisse noire', res.acces, true);
    r.check('bouton « porter » visible', res.btnVisible, true);
    r.check('action NON bloquée', res.bloque, false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── NADIA : lecture seule — voit le cahier mais ne peut pas y écrire ──
  {
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'nadia', port: 8270 });
    const res = await page.evaluate(async () => {
      window.__toasts = []; window.toast = (m) => window.__toasts.push(String(m));
      _dbCache = [{ id: 1, montant: 5000, patient: { nom: 'A', dossier: 'D1', date: '2026-10-01' } }];
      _selectedIds = new Set([1]); _filterCorbeille = false;
      renderHistory();
      const btn = document.getElementById('bulk-cahier-noir-btn');
      await bulkCahierNoir();
      return { acces: accesCaisseNoire(), btnVisible: btn && btn.style.display !== 'none',
               bloque: window.__toasts.some(m => /réservée/i.test(m)) };
    });
    r.section('Nadia (lecture seule)');
    r.check('garde l\'accès en lecture', res.acces, true);
    r.check('bouton « porter » MASQUÉ', res.btnVisible, false);
    r.check('écriture bloquée (réservée admin)', res.bloque, true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── autres comptes : aucun accès ────────────────────────────────────
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
    r.check('pas d\'accès', res.acces, false);
    r.check('bouton masqué', res.btnVisible, false);
    r.check('aucun report effectué', res.porte, false);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

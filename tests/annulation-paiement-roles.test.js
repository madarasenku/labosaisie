// ✅ v13.228 — ANNULER un paiement est réservé à l'admin et au caissier.
// Les agents peuvent ENCAISSER (v13.225) mais PAS annuler/reverser un paiement
// (séparation des tâches : prendre l'argent ≠ le rendre). On vérifie le droit
// peutAnnulerPaiement() par rôle, le masquage du bouton groupé « Annuler
// paiement » pour l'agent, et le blocage de bulkAnnulerPaiement côté agent.
const { serve, openApp, createReporter } = require('./helpers');

const AUJ = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

const FICHES = [
  { id: 71, type: 'Dossier', montant: 3000, created_at: AUJ + 'T09:00:00Z', created_by: 'agent1',
    patient: { nom: 'PAYE UN', dossier: 'P1', date: AUJ, paiement_status: 'paye',
               paiement_infos: { montant_recu: 3000 } },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
];

(async () => {
  const srv = await serve(8288);
  const r = createReporter('ANNULATION PAIEMENT — ADMIN / CAISSIER');

  // ── Agent : ne peut pas annuler ────────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'agent1', userId: 2, port: 8288,
      rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [],
             caissier_exists: true } });
    const res = await page.evaluate(async () => {
      window.__annulCalls = [];
      const orig = _sb.rpc;
      _sb.rpc = async (n, p) => { if (n === 'update_dossier_patient') window.__annulCalls.push(p); return orig ? orig(n, p) : { data: 'ok', error: null }; };
      await refreshDB(true);
      window.showConfirmModal = async () => true;
      _selectedIds = new Set([71]);
      updateBulkToolbar();
      const btn = document.getElementById('bulk-annuler-btn');
      const btnVisible = btn ? btn.style.display !== 'none' : null;
      await bulkAnnulerPaiement();                 // doit être bloqué
      return { peut: peutAnnulerPaiement(), peutEncaisser: peutEncaisser(),
               btnVisible, appels: window.__annulCalls.length,
               statut: getPaiementStatus(71) };
    });
    r.section('Agent');
    r.check('peutAnnulerPaiement = false', res.peut, false);
    r.check('peut toujours encaisser', res.peutEncaisser, true);
    r.check('bouton « Annuler paiement » masqué', res.btnVisible, false);
    r.check('bulkAnnulerPaiement bloqué (aucun appel serveur)', res.appels, 0);
    r.check('dossier reste payé', res.statut, 'paye');
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));
    await ctx.close();
  }

  // ── Admin : peut annuler ───────────────────────────────────────────
  {
    const { ctx, page } = await openApp({ role: 'admin', username: 'admin', port: 8288,
      rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [] } });
    const res = await page.evaluate(async () => {
      await refreshDB(true);
      _selectedIds = new Set([71]);
      updateBulkToolbar();
      const btn = document.getElementById('bulk-annuler-btn');
      return { peut: peutAnnulerPaiement(), btnVisible: btn ? btn.style.display !== 'none' : null };
    });
    r.section('Admin');
    r.check('peutAnnulerPaiement = true', res.peut, true);
    r.check('bouton « Annuler paiement » visible', res.btnVisible, true);
    await ctx.close();
  }

  // ── Caissier : peut annuler ────────────────────────────────────────
  {
    const { ctx, page } = await openApp({ role: 'caissier', username: 'caisse1', userId: 6, port: 8288,
      rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [] } });
    const peut = await page.evaluate(() => peutAnnulerPaiement());
    r.section('Caissier');
    r.check('peutAnnulerPaiement = true', peut, true);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

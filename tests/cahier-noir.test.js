// ✅ v13.205 — Cahier NOIR : copie du jaune, écriture réservée à l'admin,
// partage optionnel, report manuel depuis l'historique (colonne au choix).
// Le module cahier-jaune.js sert les DEUX cahiers via _cahierActif + _cjR().
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('CAHIER NOIR');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin' });

  // ── Onglets : accès aux deux cahiers ────────────────────────────────
  r.section('Onglets jaune + noir selon l\'accès');
  const nav = await page.evaluate(async () => {
    _sb.rpc = async (n) => {
      if (n === 'mon_acces_cahier')      return { data: { autorise: true, admin: true, config: {} }, error: null };
      if (n === 'mon_acces_cahier_noir') return { data: { autorise: true, admin: true, config: {} }, error: null };
      return { data: {}, error: null };
    };
    await chargerAccesCahier();
    const vis = id => { const b = document.getElementById(id); return !!b && b.style.display !== 'none'; };
    return { jaune: vis('btn-nav-cahier'), noir: vis('btn-nav-cahier-noir') };
  });
  r.check('onglet cahier jaune visible', nav.jaune, true);
  r.check('onglet cahier noir visible', nav.noir, true);

  // ── Bascule vers le noir : RPC résolues côté noir ───────────────────
  r.section('Bascule d\'onglet');
  const bascule = await page.evaluate(() => {
    ouvrirCahier('noir');
    return { actif: _cahierActif, rpcGet: _cjR('get'), rpcAjout: _cjR('ajouter'),
             titre: document.getElementById('cahier-titre')?.textContent };
  });
  r.check('cahier actif = noir', bascule.actif, 'noir');
  r.check('get → get_cahier_noir', bascule.rpcGet, 'get_cahier_noir');
  r.check('ajouter → ajouter_ecriture_noir', bascule.rpcAjout, 'ajouter_ecriture_noir');
  r.check('titre = cahier noir', /Cahier noir/.test(bascule.titre || ''), true);

  const backJaune = await page.evaluate(() => { ouvrirCahier('jaune'); return { actif: _cahierActif, rpcGet: _cjR('get') }; });
  r.check('retour au jaune : get_cahier_jaune', backJaune.rpcGet, 'get_cahier_jaune');

  // ── Porter au cahier noir depuis l'historique (colonne au choix) ────
  r.section('Report manuel vers le cahier noir');
  const report = await page.evaluate(async () => {
    window.__calls = [];
    _sb.rpc = async (n, p) => {
      window.__calls.push({ n, p });
      if (n === 'get_cahier_noir') return { data: { mois: '2026-09', colonnes: [
        { id: 1, libelle: 'DIVERS', archivee: false }, { id: 2, libelle: 'PRÊTS', archivee: false } ],
        ecritures: [] }, error: null };
      return { data: { ok: true }, error: null };
    };
    window.showConfirmModal = async () => true;
    _dbCache = [
      { id: 10, montant: 15000, savedAt: '2026-09-24T09:00:00Z', patient: { nom: 'KOFFI', dossier: '0500-0926', date: '2026-09-24' } },
      { id: 11, montant: 0,     savedAt: '2026-09-24T09:00:00Z', patient: { nom: 'ZERO',  dossier: '0501-0926', date: '2026-09-24' } },
    ];
    _selectedIds = new Set([10, 11]);
    await bulkCahierNoir();                 // ouvre la modale (récupère les colonnes)
    document.getElementById('cn-report-colonne').value = 'PRÊTS';
    await submitReportNoir();
    const ports = window.__calls.filter(c => c.n === 'porter_au_cahier_noir');
    return { nb: ports.length, colonne: ports[0] && ports[0].p.p_libelle_colonne,
             montant: ports[0] && ports[0].p.p_montant, id: ports[0] && ports[0].p.p_resultat_id };
  });
  r.check('1 dossier porté (le 0 F ignoré)', report.nb, 1);
  r.check('vers la colonne choisie (PRÊTS)', report.colonne, 'PRÊTS');
  r.check('montant exact (15000)', report.montant, 15000);
  r.check('sur le bon dossier (#10)', report.id, 10);

  // ── Un compte sans partage ne voit pas le noir ──────────────────────
  r.section('Accès refusé sans partage');
  const refuse = await page.evaluate(async () => {
    _sb.rpc = async (n) => {
      if (n === 'mon_acces_cahier')      return { data: { autorise: true,  admin: false }, error: null };
      if (n === 'mon_acces_cahier_noir') return { data: { autorise: false, admin: false }, error: null };
      return { data: {}, error: null };
    };
    await chargerAccesCahier();
    const vis = id => { const b = document.getElementById(id); return !!b && b.style.display !== 'none'; };
    return { jaune: vis('btn-nav-cahier'), noir: vis('btn-nav-cahier-noir') };
  });
  r.check('cahier jaune partagé → visible', refuse.jaune, true);
  r.check('cahier noir non partagé → masqué', refuse.noir, false);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

// ════════════════════════════════════════════════════════════════════
//  Rôle « Responsable » — les actions qu'on lui promet MARCHENT (v13.245)
//    La v13.244 affichait le cadenas mais le clic était refusé côté écran,
//    la caisse restait en vue agent et les valeurs de référence étaient
//    vides. Ce test CLIQUE et vérifie que l'appel part bien au serveur.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8331;
// En production depuis v13.247 : la racine par défaut (CIBLE=/preview/index.html pour le lien de test).
const CIBLE = process.env.CIBLE || '/index.html';
const AUJ = new Date().toISOString().slice(0, 10);

const fiche = (id, par, masquePar) => ({
  id, type: 'Dossier', montant: 3000, created_at: AUJ + 'T09:00:00Z',
  patient: { nom: 'PATIENT ' + id, dossier: '0' + id + '-1026', date: AUJ, statut: 'attente' },
  resultats: {}, created_by: par, prescripteur_id: 1, est_bpn: false,
  restricted_by: masquePar, deleted_at: null,
});
const RESP = { role: 'responsable', username: 'Responsable', userId: 49, port: PORT, cible: CIBLE };

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('RESPONSABLE — LES ACTIONS FONCTIONNENT');
  let erreurs = [];

  {
    r.section('Masquer la fiche d\'un agent : l\'appel part au serveur');
    const appels = [];
    const { ctx, page, errors } = await openApp({ ...RESP, appels,
      rpc: { get_resultats_light: [fiche(701, 'YERIGUE', null), fiche(702, 'admin', null)],
             get_restriction_status: [], get_deleted_status: [], toggle_restriction: 'restricted' } });
    await page.evaluate(() => { window.showConfirmModal = async () => true; showView('historique'); });
    await page.waitForTimeout(900);
    r.check('cadenas sur la fiche de l\'agent', await page.evaluate(() => !!document.getElementById('lock-btn-701')), true);
    r.check('pas de cadenas sur une fiche de la direction', await page.evaluate(() => !!document.getElementById('lock-btn-702')), false);
    await page.evaluate(() => toggleRestriction(701));
    await page.waitForTimeout(500);
    r.check('toggle_restriction envoyé', appels.includes('toggle_restriction'), true);
    r.check('fiche marquée masquée', await page.evaluate(() => _dbCache.find(x => x.id === 701).restrictedBy), 'Responsable');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Masquage par lot : les fiches des agents sont retenues');
    const appels = [];
    const { ctx, page, errors } = await openApp({ ...RESP, appels,
      rpc: { get_resultats_light: [fiche(711, 'YERIGUE', null), fiche(712, 'Agent B', null)],
             get_restriction_status: [], get_deleted_status: [], toggle_restriction: 'restricted' } });
    await page.evaluate(() => { window.showConfirmModal = async () => true; showView('historique'); });
    await page.waitForTimeout(900);
    await page.evaluate(async () => { _selectedIds.add(711); _selectedIds.add(712); await bulkLock(); });
    await page.waitForTimeout(400);
    r.check('2 appels de masquage', appels.filter(a => a === 'toggle_restriction').length, 2);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Démasquer : les fiches masquées par un agent, pas celles de la direction');
    const { ctx, page, errors } = await openApp({ ...RESP,
      rpc: { get_resultats_light: [fiche(721, 'YERIGUE', 'YERIGUE'), fiche(722, 'YERIGUE', 'admin')],
             get_restriction_status: [{ id: 721, restricted_by: 'YERIGUE' }, { id: 722, restricted_by: 'admin' }],
             get_deleted_status: [] } });
    r.check('peut démasquer la fiche masquée par l\'agent',
      await page.evaluate(() => peutMasquerFiche({ createdBy: 'YERIGUE', restrictedBy: 'YERIGUE' })), true);
    r.check('ne peut pas démasquer une fiche masquée par la direction',
      await page.evaluate(() => peutMasquerFiche({ createdBy: 'YERIGUE', restrictedBy: 'admin' })), false);
    r.check('ne peut pas toucher une fiche créée par Nadia',
      await page.evaluate(() => peutMasquerFiche({ createdBy: 'nadia', restrictedBy: null })), false);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Caisse : vue complète, ristournes, annulation, déverrouillage');
    const appels = [];
    const { ctx, page, errors } = await openApp({ ...RESP, appels,
      rpc: { get_resultats_light: [fiche(731, 'YERIGUE', null)], get_restriction_status: [], get_deleted_status: [],
             caissier_exists: true, deverrouiller_journee: 'ok', set_taux_ristourne: 'ok',
             get_prescripteurs: [{ id: 5, nom: 'Dr TEST', specialite: '', structure: '', taux_ristourne: 10, actif: true }] } });
    await page.evaluate(() => showView('caisse'));
    await page.waitForTimeout(900);
    r.check('caisse complète affichée', await page.evaluate(() => document.getElementById('view-caisse').style.display !== 'none'), true);
    r.check('vue agent simplifiée masquée', await page.evaluate(() => document.getElementById('view-caisse-user').style.display), 'none');
    r.check('carte de clôture visible', await page.evaluate(() =>
      getComputedStyle(document.getElementById('cloture-card')).display !== 'none'), true);
    r.check('ristournes prescripteurs visibles', await page.evaluate(() =>
      getComputedStyle(document.getElementById('caisse-ristournes-card')).display !== 'none'), true);
    r.check('peut clôturer (tientLaCaisse)', await page.evaluate(() => tientLaCaisse()), true);
    r.check('peut annuler un paiement', await page.evaluate(() => peutAnnulerPaiement()), true);
    await page.evaluate(async () => { window.showConfirmModal = async () => true; await deverrouillerJournee(); });
    await page.waitForTimeout(300);
    r.check('déverrouillage envoyé au serveur', appels.includes('deverrouiller_journee'), true);
    const taux = await page.evaluate(async () => {
      window._prescripteurs = [{ id: 5, nom: 'Dr TEST', taux_ristourne: 10 }];
      if (typeof _prescripteurs !== 'undefined') _prescripteurs = window._prescripteurs;
      const inp = document.createElement('input'); inp.id = 'rist_taux_5'; inp.value = '15'; document.body.appendChild(inp);
      await saveRistourneTaux();
      return _prescripteurs[0].taux_ristourne;
    });
    r.check('taux de ristourne envoyé (set_taux_ristourne)', appels.includes('set_taux_ristourne'), true);
    r.check('taux mis à jour', taux, 15);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Configuration : onglets et valeurs de référence');
    const { ctx, page, errors } = await openApp({ ...RESP, rpc: { list_users_admin: [] } });
    await page.evaluate(() => showView('comptes'));
    await page.waitForTimeout(700);
    const visibles = await page.evaluate(() => [...document.querySelectorAll('#view-comptes .admin-tab-main, #view-comptes .admin-tab-sub')]
      .filter(b => b.style.display !== 'none').map(b => _cibleOnglet(b)).sort().join(','));
    r.check('onglets ouverts (liste blanche)', visibles, 'ac-comptes,ac-config,ac-refs,ac-tarifs,ac-users');
    await page.evaluate(() => {
      adminShowMain('ac-config', [...document.querySelectorAll('#view-comptes .admin-tab-main')].find(b => _cibleOnglet(b) === 'ac-config'));
      adminShowSub('ac-refs', [...document.querySelectorAll('#view-comptes .admin-tab-sub')].find(b => _cibleOnglet(b) === 'ac-refs'));
    });
    await page.waitForTimeout(500);
    r.check('valeurs de référence affichées', await page.evaluate(() =>
      getComputedStyle(document.getElementById('ac-refs')).display !== 'none'), true);
    r.check('éditeur rempli', await page.evaluate(() => document.querySelectorAll('#ac-refs input[id^="rref_"]').length > 10), true);
    r.check('tuile d\'accueil sans « prescripteurs »', await page.evaluate(() => {
      showView('accueil'); return document.getElementById('kio-comptes-sub').textContent; }), 'Utilisateurs, tarifs, valeurs de référence');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Un refus du serveur n\'est pas gardé sur le poste');
    const { ctx, page, errors } = await openApp({ ...RESP,
      rpc: { get_tarifs: {}, save_tarifs: 'forbidden', save_examens_custom: 'forbidden' } });
    const res = await page.evaluate(async () => {
      window.toast = () => {};
      localStorage.setItem('tarifs_ref', JSON.stringify({ ex_nfs: 3000 }));
      _tarifsRefCache = null;
      const ref = getTarifsRef(); ref.ex_nfs = 999;          // l'appelant modifie le cache par référence
      await saveTarifsRef(ref);
      const t = getTarifsRef().ex_nfs;
      localStorage.setItem('examens_custom', JSON.stringify([{ id: 'a', label: 'A', prix: 1 }]));
      _examensCustomCache = null;
      await saveExamensCustom([{ id: 'b', label: 'B', prix: 2 }]);
      return t + '|' + getExamensCustom().map(e => e.id).join(',');
    });
    r.check('tarif et catalogue restaurés', res, '3000|a');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('v13.246 — Refus : grille réaffichée, catalogue d\'abord, normes restaurées');
    const appels = [];
    const { ctx, page, errors } = await openApp({ ...RESP, appels,
      rpc: { get_tarifs: {}, save_tarifs: 'forbidden', save_examens_custom: 'forbidden', save_refs_config: 'forbidden',
             set_taux_ristourne: null, list_users_admin: [] } });
    const res = await page.evaluate(async () => {
      window.toast = () => {};
      showView('comptes'); buildAdminExamensGrid();
      localStorage.setItem('tarifs_ref', JSON.stringify({ ex_nfs: 3000 })); _tarifsRefCache = null;
      buildAdminExamensGrid();
      const champ = document.getElementById('adm_px_ex_nfs');
      if (!champ) return 'pas de champ NFS';
      champ.value = '999';
      await saveAdminTarifs();
      const grille = document.getElementById('adm_px_ex_nfs').value;
      // Catalogue refusé : les tarifs ne doivent même pas partir.
      window.__nbTarifs = 0;
      document.getElementById('new_ex_label') && (document.getElementById('new_ex_label').value = 'Examen test');
      return grille;
    });
    r.check('grille réaffichée avec le prix en vigueur', res, '3000');
    const avantTarifs = appels.filter(a => a === 'save_tarifs').length;
    await page.evaluate(async () => { window.showConfirmModal = async () => true;
      localStorage.setItem('examens_custom', JSON.stringify([{ id: 'x1', label: 'X1', prix: 5, tab: 'hema', groupe: 'g', custom: true }]));
      _examensCustomCache = null; await removeExamenCustom('x1'); });
    r.check('catalogue refusé → tarifs non envoyés', appels.filter(a => a === 'save_tarifs').length, avantTarifs);
    r.check('catalogue restauré', await page.evaluate(() => getExamensCustom().map(e => e.id).join(',')), 'x1');
    r.check('normes restaurées après refus', await page.evaluate(async () => {
      localStorage.setItem(LABO_REFS_KEY, JSON.stringify({ hb: { ref: '12-17', lo: 12, hi: 17, unit: 'g/dL' } }));
      _customRefsCache = null; buildRefsEditor();
      const el = document.getElementById('rref_hb'); if (el) el.value = '1-2';
      await saveRefsConfig();
      return getCustomRefs().hb && getCustomRefs().hb.ref;
    }), '12-17');
    r.check('taux : réponse vide comptée en échec', await page.evaluate(async () => {
      _prescripteurs = [{ id: 5, nom: 'Dr TEST', taux_ristourne: 10 }];
      const inp = document.createElement('input'); inp.id = 'rist_taux_5'; inp.value = '15'; document.body.appendChild(inp);
      await saveRistourneTaux(); return _prescripteurs[0].taux_ristourne; }), 10);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('v13.247 — Double clic, fenêtre d\'ajout, ristournes, sans serveur');
    const { ctx, page, errors } = await openApp({ ...RESP,
      rpc: { get_tarifs: {}, save_tarifs: 'forbidden', save_examens_custom: 'forbidden', list_users_admin: [] } });
    r.check('double clic + double refus : prix d\'origine', await page.evaluate(async () => {
      window.toast = () => {};
      localStorage.setItem('tarifs_ref', JSON.stringify({ ex_nfs: 3000 })); _tarifsRefCache = null;
      const a = saveTarifsRef({ ex_nfs: 111 });
      const b = saveTarifsRef({ ex_nfs: 222 });
      await Promise.all([a, b]);
      return JSON.parse(localStorage.getItem('tarifs_ref')).ex_nfs + '/' + getTarifsRef().ex_nfs;
    }), '3000/3000');
    r.check('ajout refusé : fenêtre ouverte, saisie gardée', await page.evaluate(async () => {
      window.toast = () => {};
      const m = document.getElementById('add-examen-modal'); m.style.display = 'flex';
      document.getElementById('new_ex_label').value = 'Examen X';
      document.getElementById('new_ex_prix').value = '4500';
      await addExamenPersonnalise();
      return m.style.display + '|' + document.getElementById('new_ex_label').value + '|' + document.getElementById('new_ex_prix').value;
    }), 'flex|Examen X|4500');
    r.check('ristournes : plantage → chargement refermé, taux locaux gardés', await page.evaluate(async () => {
      window.toast = () => {};
      localStorage.setItem(RISTOURNE_TAUX_KEY, '{"5":15}');
      _prescripteurs = [{ id: 5, nom: 'Dr TEST', taux_ristourne: 10 }];
      const inp = document.createElement('input'); inp.id = 'rist_taux_5'; inp.value = '15'; document.body.appendChild(inp);
      const vrai = _sb.rpc; _sb.rpc = () => { throw new Error('réseau'); };
      try { await saveRistourneTaux(); } finally { _sb.rpc = vrai; }
      return document.getElementById('loading-overlay').classList.contains('active') + '|' + localStorage.getItem(RISTOURNE_TAUX_KEY);
    }), 'false|{"5":15}');
    r.check('sans serveur : message neutre', await page.evaluate(async () => {
      let msg = null, type = null; window.toast = (m, t) => { msg = m; type = t; };
      const vrai = _sb; _sb = null;
      try { await saveTarifsRef({ ex_nfs: 3000 }); } finally { _sb = vrai; }
      return type + '|' + /poste seulement/.test(msg);
    }), '|true');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Création de compte : pas de tracé de signature');
    const { ctx, page, errors } = await openApp({ ...RESP, rpc: { list_users_admin: [], create_user_admin: 'ok' } });
    await page.evaluate(async () => {
      showView('comptes');
      document.getElementById('nu_username').value = 'agent9';
      document.getElementById('nu_password').value = 'Motdepasse9';
      document.getElementById('nu_role').value = 'agent';
      await createUserAccount();
    });
    await page.waitForTimeout(400);
    r.check('fenêtre de signature non ouverte', await page.evaluate(() => !!document.getElementById('modal-pad')), false);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Agent ordinaire : inchangé');
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'agent1', userId: 2, port: PORT, cible: CIBLE });
    r.check('masque sa propre fiche', await page.evaluate(() => peutMasquerFiche({ createdBy: 'agent1', restrictedBy: null })), true);
    r.check('pas la fiche d\'un autre', await page.evaluate(() => peutMasquerFiche({ createdBy: 'agent2', restrictedBy: null })), false);
    r.check('ne lève pas un masquage de l\'admin', await page.evaluate(() => peutMasquerFiche({ createdBy: 'agent1', restrictedBy: 'admin' })), false);
    erreurs = erreurs.concat(errors); await ctx.close();
  }

  r.check('aucune erreur JS', erreurs.length, 0);
  if (erreurs.length) console.log('   ', erreurs.slice(0, 3));
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

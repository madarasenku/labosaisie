// ════════════════════════════════════════════════════════════════════
//  Rôle « Responsable » — les actions qu'on lui promet MARCHENT (v13.245)
//    La v13.244 affichait le cadenas mais le clic était refusé côté écran,
//    la caisse restait en vue agent et les valeurs de référence étaient
//    vides. Ce test CLIQUE et vérifie que l'appel part bien au serveur.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8331;
// Contrôles v13.248 : sur le lien de test d'abord, la racine suit à la mise en production.
const CIBLE = process.env.CIBLE || '/preview/index.html';
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
      rpc: { get_resultats_light: [{ ...fiche(731, 'YERIGUE', null), prescripteur_id: 5 }], get_restriction_status: [], get_deleted_status: [],
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
    r.check('ligne de ristourne affichée', await page.evaluate(() => !!document.getElementById('rist_taux_5')), true);
    const taux = await page.evaluate(async () => {
      window.toast = () => {};
      document.getElementById('rist_taux_5').value = '15';
      document.querySelector('[onclick="saveRistourneTaux()"]').click();
      for (let i = 0; i < 100 && _actionsEnCours.saveRistourneTaux; i++) await new Promise(r => setTimeout(r, 30));
      return _prescripteurs.find(p => p.id === 5).taux_ristourne;
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
    r.section('v13.248 — Configuration par les vrais boutons');
    const PRESC = [{ id: 5, nom: 'Dr CINQ', specialite: '', structure: '', taux_ristourne: 10, actif: true },
                   { id: 6, nom: 'Dr SIX',  specialite: '', structure: '', taux_ristourne: 20, actif: true }];
    const { ctx, page, errors } = await openApp({ ...RESP,
      rpc: { get_tarifs: {}, list_users_admin: [], get_restriction_status: [], get_deleted_status: [], caissier_exists: true,
             get_prescripteurs: PRESC,
             get_resultats_light: [{ ...fiche(741, 'YERIGUE', null), prescripteur_id: 5 }, { ...fiche(742, 'YERIGUE', null), prescripteur_id: 6 }] } });
    // Banc d'essai : réponses du serveur pilotées appel par appel, messages capturés.
    await page.evaluate(() => {
      window.__appels = []; window.__rep = {}; window.__msgs = [];
      window.toast = (m, t) => { window.__msgs.push([t, m]); };
      window.showConfirmModal = async () => true;
      const vrai = _sb.rpc.bind(_sb);
      _sb.rpc = (nom, params) => { window.__appels.push(nom);
        return window.__rep[nom] ? window.__rep[nom](params) : vrai(nom, params); };
      window.__lent = (rep, ms = 250) => () => new Promise(r => setTimeout(() => r(rep), ms));
      window.__fin = async (nom) => { await new Promise(r => setTimeout(r, 20));
        for (let i = 0; i < 200 && _actionsEnCours[nom]; i++) await new Promise(r => setTimeout(r, 25)); };
      window.__nb = (nom) => window.__appels.filter(a => a === nom).length;
      window.__dernier = () => window.__msgs[window.__msgs.length - 1] || [];
      window.__grille = () => { localStorage.setItem('tarifs_ref', JSON.stringify({ ex_nfs: 3000 }));
        _tarifsRefCache = null; showView('comptes'); buildAdminExamensGrid(); };
      window.__clic = (sel) => document.querySelector(sel).click();
    });
    const OK = { data: 'ok', error: null, status: 200 };
    const REFUS = { data: 'forbidden', error: null, status: 200 };
    const ERREUR = { data: null, error: { message: 'exception SQL' }, status: 500 };
    const RESEAU = { data: null, error: { message: 'FetchError: Failed to fetch' }, status: 0 };

    // — Tarifs —
    for (const [nom, rep, attendu, type] of [['refus', REFUS, '3000', 'err'], ['erreur du serveur', ERREUR, '3000', 'err'],
                                             ['réseau coupé', RESEAU, '999', '']]) {
      const res = await page.evaluate(async (rep) => {
        __grille(); __rep.save_tarifs = () => Promise.resolve(rep);
        document.getElementById('adm_px_ex_nfs').value = '999';
        __clic('[onclick="saveAdminTarifs()"]'); await __fin('saveAdminTarifs');
        return [document.getElementById('adm_px_ex_nfs').value, JSON.parse(localStorage.getItem('tarifs_ref')).ex_nfs,
                getTarifsRef().ex_nfs, __dernier()[0]];
      }, rep);
      r.check('tarifs, ' + nom + ' : écran / poste / mémoire / message', res.join('|'), [attendu, attendu, attendu, type].join('|'));
    }
    r.check('tarifs : double clic → un seul envoi', await page.evaluate(async (ok) => {
      __grille(); __appels.length = 0; __rep.save_tarifs = __lent(ok);
      const b = document.querySelector('[onclick="saveAdminTarifs()"]');
      b.click(); const desactive = b.disabled; b.click();
      await __fin('saveAdminTarifs');
      return __nb('save_tarifs') + '|' + desactive + '|' + b.disabled;
    }, OK), '1|true|false');

    // — Catalogue —
    r.check('ajout refusé : fenêtre ouverte, saisie gardée, rien d\'écrit', await page.evaluate(async (refus) => {
      localStorage.setItem('examens_custom', '[]'); _examensCustomCache = null; __grille();
      __appels.length = 0; __rep.save_examens_custom = () => Promise.resolve(refus);
      showAddExamenModal();
      document.getElementById('new_ex_label').value = 'Examen X'; document.getElementById('new_ex_prix').value = '4500';
      __clic('[onclick="addExamenPersonnalise()"]'); await __fin('addExamenPersonnalise');
      const m = document.getElementById('add-examen-modal');
      return [m.style.display, document.getElementById('new_ex_label').value, getExamensCustom().length,
              Object.keys(getTarifsRef()).some(k => k.startsWith('custom_')), __nb('save_tarifs')].join('|');
    }, REFUS), 'flex|Examen X|0|false|0');
    r.check('ajout : double clic → un seul examen, un seul message', await page.evaluate(async (ok) => {
      localStorage.setItem('examens_custom', '[]'); _examensCustomCache = null; __grille();
      __appels.length = 0; __msgs.length = 0;
      __rep.save_examens_custom = __lent(ok); __rep.save_tarifs = __lent(ok);
      showAddExamenModal();
      document.getElementById('new_ex_label').value = 'Examen Y'; document.getElementById('new_ex_prix').value = '1500';
      const b = document.querySelector('[onclick="addExamenPersonnalise()"]'); b.click(); b.click();
      await __fin('addExamenPersonnalise');
      return [getExamensCustom().filter(e => e.label === 'Examen Y').length, __nb('save_examens_custom'),
              document.getElementById('add-examen-modal').style.display, __msgs.length].join('|');
    }, OK), '1|1|none|1');

    // — Valeurs de référence —
    const prepNormes = () => page.evaluate(() => {
      localStorage.setItem(LABO_REFS_KEY, JSON.stringify({ hb: { ref: '12-17', lo: 12, hi: 17, unit: 'g/dL' } }));
      _customRefsCache = null; showView('comptes'); buildRefsEditor(); });
    await prepNormes();
    r.check('normes refusées : restaurées à l\'écran et en mémoire', await page.evaluate(async (refus) => {
      __rep.save_refs_config = () => Promise.resolve(refus);
      document.getElementById('rref_hb').value = '1-2';
      __clic('[onclick="saveRefsConfig()"]'); await __fin('saveRefsConfig');
      return getCustomRefs().hb.ref + '|' + document.getElementById('rref_hb').value + '|' + __dernier()[0];
    }, REFUS), '12-17|12-17|err');
    await prepNormes();
    r.check('normes acceptées : ce qu\'on tape pendant l\'envoi n\'est pas effacé', await page.evaluate(async (ok) => {
      __rep.save_refs_config = __lent(ok, 300);
      document.getElementById('rref_hb').value = '13-18';
      __clic('[onclick="saveRefsConfig()"]');
      await new Promise(r => setTimeout(r, 60));
      const autre = [...document.querySelectorAll('#ac-refs input[id^="rref_"]')].find(i => i.id !== 'rref_hb');
      autre.value = 'tapé'; await __fin('saveRefsConfig');
      return getCustomRefs().hb.ref + '|' + document.getElementById(autre.id).value;
    }, OK), '13-18|tapé');

    // — Ristournes (vrai tableau, vrai bouton) —
    await page.evaluate(() => { _prescripteurs.length || (_prescripteurs = []); showView('caisse'); });
    await page.waitForTimeout(700);
    r.check('ristournes : deux lignes affichées', await page.evaluate(() =>
      !!document.getElementById('rist_taux_5') && !!document.getElementById('rist_taux_6')), true);
    r.check('ristournes : refus + réseau → les deux signalés, saisies gardées, chargement refermé', await page.evaluate(async ([refus, reseau]) => {
      __rep.set_taux_ristourne = (p) => Promise.resolve(p.p_prescr_id === 5 ? refus : reseau);
      document.getElementById('rist_taux_5').value = '15'; document.getElementById('rist_taux_6').value = '25';
      __clic('[onclick="saveRistourneTaux()"]'); await __fin('saveRistourneTaux');
      const [type, msg] = __dernier();
      return [document.getElementById('rist_taux_5').value, document.getElementById('rist_taux_6').value,
              _prescripteurs.find(p => p.id === 5).taux_ristourne, type, /refusé/.test(msg) && /connexion/.test(msg),
              document.getElementById('loading-overlay').classList.contains('active')].join('|');
    }, [REFUS, RESEAU]), '15|25|10|err|true|false');
    r.check('ristournes : plantage réseau → chargement refermé', await page.evaluate(async () => {
      __rep.set_taux_ristourne = () => { throw new Error('réseau'); };
      document.getElementById('rist_taux_5').value = '16';
      __clic('[onclick="saveRistourneTaux()"]'); await __fin('saveRistourneTaux');
      return document.getElementById('loading-overlay').classList.contains('active') + '|' + document.getElementById('rist_taux_5').value;
    }), 'false|16');
    r.check('ristournes : accepté → taux en vigueur', await page.evaluate(async (ok) => {
      __rep.set_taux_ristourne = () => Promise.resolve(ok);
      document.getElementById('rist_taux_5').value = '17';
      __clic('[onclick="saveRistourneTaux()"]'); await __fin('saveRistourneTaux');
      return _prescripteurs.find(p => p.id === 5).taux_ristourne + '|' + __dernier()[0];
    }, OK), '17|ok');

    // — Sans client serveur : message neutre, valeur gardée sur le poste —
    r.check('sans serveur : message neutre', await page.evaluate(async () => {
      const vrai = _sb; _sb = null;
      try { await saveTarifsRef({ ex_nfs: 3100 }); } finally { _sb = vrai; }
      return __dernier()[0] + '|' + /poste seulement/.test(__dernier()[1]) + '|' + getTarifsRef().ex_nfs;
    }), '|true|3100');
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

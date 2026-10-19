// ════════════════════════════════════════════════════════════════════
//  Rôle « Responsable » — les actions qu'on lui promet MARCHENT (v13.245)
//    La v13.244 affichait le cadenas mais le clic était refusé côté écran,
//    la caisse restait en vue agent et les valeurs de référence étaient
//    vides. Ce test CLIQUE et vérifie que l'appel part bien au serveur.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8331;
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
    const PASSERELLE = { data: null, error: { message: 'Service Unavailable' }, status: 503 };

    // — Tarifs —
    // v13.249 : sur refus, l'écran GARDE la saisie (pour réessayer) ; poste et mémoire sont restaurés.
    for (const [nom, rep, ecran, attendu, type] of [['refus', REFUS, '999', '3000', 'err'], ['erreur du serveur', ERREUR, '999', '3000', 'err'],
                                             ['passerelle 503', PASSERELLE, '999', '999', ''], ['réseau coupé', RESEAU, '999', '999', '']]) {
      const res = await page.evaluate(async (rep) => {
        __grille(); __rep.save_tarifs = () => Promise.resolve(rep);
        document.getElementById('adm_px_ex_nfs').value = '999';
        __clic('[onclick="saveAdminTarifs()"]'); await __fin('saveAdminTarifs');
        return [document.getElementById('adm_px_ex_nfs').value, JSON.parse(localStorage.getItem('tarifs_ref')).ex_nfs,
                getTarifsRef().ex_nfs, __dernier()[0]];
      }, rep);
      r.check('tarifs, ' + nom + ' : écran / poste / mémoire / message', res.join('|'), [ecran, attendu, attendu, type].join('|'));
    }
    r.check('tarifs : double clic → un seul envoi', await page.evaluate(async (ok) => {
      __grille(); __appels.length = 0; __rep.save_tarifs = __lent(ok);
      document.getElementById('adm_px_ex_nfs').value = '3200';
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
    r.check('normes refusées : mémoire restaurée, saisie et frappe pendant l\'envoi gardées', await page.evaluate(async (refus) => {
      __rep.save_refs_config = __lent(refus, 300);
      document.getElementById('rref_hb').value = '1-2';
      __clic('[onclick="saveRefsConfig()"]');
      await new Promise(r => setTimeout(r, 60));
      const autre = [...document.querySelectorAll('#ac-refs input[id^="rref_"]')].find(i => i.id !== 'rref_hb');
      autre.value = 'tapé'; await __fin('saveRefsConfig');
      return [getCustomRefs().hb.ref, document.getElementById('rref_hb').value,
              document.getElementById(autre.id).value, __dernier()[0]].join('|');
    }, REFUS), '12-17|1-2|tapé|err');
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
    r.check('ristournes : le total suit les taux affichés', await page.evaluate(() => {
      const total = () => document.getElementById('rist-total-cell').textContent;
      const avant = total();
      const inp = document.getElementById('rist_taux_5'), initial = inp.value;
      inp.value = '90'; inp.dispatchEvent(new Event('change'));
      const apres = total();
      inp.value = initial; inp.dispatchEvent(new Event('change'));
      return (avant !== apres) + '|' + (total() === avant);
    }), 'true|true');
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

    // — v13.249 : délai, file d'attente, retour en arrière depuis la mémoire —
    r.check('délai dépassé : requête annulée, valeur gardée, message neutre, bouton libéré', await page.evaluate(async () => {
      __grille(); _DELAI_CONFIG_MS = 200; window.__sig = null;
      __rep.save_tarifs = () => { const pr = new Promise(() => {}); pr.abortSignal = (sig) => { window.__sig = sig; return pr; }; return pr; };
      try {
        document.getElementById('adm_px_ex_nfs').value = '999';
        __clic('[onclick="saveAdminTarifs()"]'); await __fin('saveAdminTarifs');
      } finally { _DELAI_CONFIG_MS = 20000; }
      return [!!(__sig && __sig.aborted), getTarifsRef().ex_nfs, __dernier()[0], /injoignable/.test(__dernier()[1]),
              document.querySelector('[onclick="saveAdminTarifs()"]').disabled].join('|');
    }), 'true|999||true|false');
    r.check('prix refusé puis examen ajouté : le 2e envoi part de la grille RESTAURÉE', await page.evaluate(async ([refus, ok]) => {
      localStorage.setItem('examens_custom', '[]'); _examensCustomCache = null; __grille();
      const envois = [];
      let n = 0;
      __rep.save_tarifs = (p) => { envois.push(p.p_grille); return n++ === 0 ? __lent(refus, 300)() : Promise.resolve(ok); };
      __rep.save_examens_custom = () => Promise.resolve(ok);
      document.getElementById('adm_px_ex_nfs').value = '999';
      __clic('[onclick="saveAdminTarifs()"]');
      await new Promise(r => setTimeout(r, 30));
      showAddExamenModal();
      document.getElementById('new_ex_label').value = 'Examen Z'; document.getElementById('new_ex_prix').value = '2500';
      __clic('[onclick="addExamenPersonnalise()"]');
      await __fin('saveAdminTarifs'); await __fin('addExamenPersonnalise');
      const g = getTarifsRef(); const cle = Object.keys(g).find(k => k.startsWith('custom_'));
      return [envois.length, envois[0].ex_nfs, envois[1].ex_nfs, g.ex_nfs, g[cle]].join('|');
    }, [REFUS, OK]), '2|999|3000|3000|2500');
    r.check('refus sans stockage local : retour à la grille du serveur, pas aux prix d\'usine', await page.evaluate(async (refus) => {
      _tarifsRefCache = { ex_nfs: 4321 }; _examensCustomCache = [{ id: 'custom_a', label: 'A', prix: 1 }];
      localStorage.removeItem('tarifs_ref'); localStorage.removeItem('examens_custom');
      __rep.save_tarifs = () => Promise.resolve(refus); __rep.save_examens_custom = () => Promise.resolve(refus);
      const vrai = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
      try { await saveTarifsRef({ ex_nfs: 999 }); await saveExamensCustom([]); }
      finally { Storage.prototype.setItem = vrai; }
      return getTarifsRef().ex_nfs + '|' + getExamensCustom().length;
    }, REFUS), '4321|1');
    r.check('suppression : une confirmation remplacée ne bloque plus les boutons ✕', await page.evaluate(async (ok) => {
      localStorage.setItem('examens_custom', JSON.stringify([{ id: 'custom_b', label: 'B', groupe: '🔬 Autres', prix: 1, tab: 'hema', custom: true }]));
      _examensCustomCache = null; __grille();
      __rep.save_examens_custom = () => Promise.resolve(ok); __rep.save_tarifs = () => Promise.resolve(ok);
      let n = 0;
      window.showConfirmModal = () => n++ === 0 ? new Promise(() => {}) : Promise.resolve(true);
      removeExamenCustom('custom_b');                 // 1re fenêtre, jamais résolue (remplacée)
      await new Promise(r => setTimeout(r, 30));
      await removeExamenCustom('custom_b');
      window.showConfirmModal = async () => true;
      return getExamensCustom().length + '|' + !!_actionsEnCours.removeExamenCustom;
    }, OK), '0|false');
    r.check('tarifs : seuls les prix modifiés partent (une remise à zéro en cours n\'est pas écrasée)', await page.evaluate(async (ok) => {
      localStorage.setItem('tarifs_ref', JSON.stringify({ ...buildTarifsRefDefault(), ex_nfs: 9000, ex_crp: 9100 }));
      _tarifsRefCache = null; showView('comptes'); buildAdminExamensGrid();
      const envois = []; __rep.save_tarifs = (p) => { envois.push(p.p_grille); return __lent(ok, 200)(); };
      window.showConfirmModal = async () => true;
      resetAdminTarifs();                                   // ex_nfs / ex_crp → prix d'usine
      await new Promise(r => setTimeout(r, 30));
      // La grille affiche encore 9000 / 9100 si elle n'a pas été redessinée : on simule ce cas.
      document.getElementById('adm_px_ex_nfs').dataset.affiche = '9000';
      document.getElementById('adm_px_ex_nfs').value = '9000';
      document.getElementById('adm_px_ex_crp').dataset.affiche = '9100';
      document.getElementById('adm_px_ex_crp').value = '7777';
      saveAdminTarifs();
      await __fin('resetAdminTarifs'); await __fin('saveAdminTarifs');
      const d = buildTarifsRefDefault(), g = getTarifsRef();
      return [envois.length, g.ex_nfs === d.ex_nfs, g.ex_crp].join('|');
    }, OK), '2|true|7777');
    r.check('suppression de B pendant l\'envoi de A : les deux partent', await page.evaluate(async (ok) => {
      localStorage.setItem('examens_custom', JSON.stringify([
        { id: 'custom_c', label: 'C', groupe: '🔬 Autres', prix: 1, tab: 'hema', custom: true },
        { id: 'custom_d', label: 'D', groupe: '🔬 Autres', prix: 1, tab: 'hema', custom: true }]));
      _examensCustomCache = null; __grille(); __msgs.length = 0;
      __rep.save_examens_custom = __lent(ok, 200); __rep.save_tarifs = () => Promise.resolve(ok);
      window.showConfirmModal = async () => true;
      const a = removeExamenCustom('custom_c');
      await new Promise(r => setTimeout(r, 30));
      await Promise.all([a, removeExamenCustom('custom_d')]);
      return getExamensCustom().length + '|' + __msgs.some(m => /en cours/.test(m[1]));
    }, OK), '0|false');
    // — Remises à zéro des normes : elles partent au serveur —
    await prepNormes();
    r.check('normes : remise à zéro d\'une valeur envoyée au serveur', await page.evaluate(async (ok) => {
      let envoye = null; __rep.save_refs_config = (p) => { envoye = p.p_refs; return Promise.resolve(ok); };
      await resetOneRef('hb');
      return [envoye && !('hb' in envoye), !('hb' in getCustomRefs()), __dernier()[0], /tous les postes/.test(__dernier()[1])].join('|');
    }, OK), 'true|true|ok|true');
    await prepNormes();
    r.check('normes : remise à zéro refusée → valeur rétablie', await page.evaluate(async (refus) => {
      __rep.save_refs_config = () => Promise.resolve(refus);
      await resetOneRef('hb');
      return getCustomRefs().hb.ref + '|' + document.getElementById('rref_hb').value + '|' + __dernier()[0];
    }, REFUS), '12-17|12-17|err');
    r.check('ristournes : requête bloquée → chargement refermé au délai, saisie gardée', await page.evaluate(async () => {
      showView('caisse'); await new Promise(r => setTimeout(r, 300));
      _DELAI_CONFIG_MS = 200;
      __rep.set_taux_ristourne = () => new Promise(() => {});
      try {
        document.getElementById('rist_taux_6').value = '30';
        __clic('[onclick="saveRistourneTaux()"]'); await __fin('saveRistourneTaux');
      } finally { _DELAI_CONFIG_MS = 20000; }
      return [document.getElementById('loading-overlay').classList.contains('active'),
              document.getElementById('rist_taux_6').value, /connexion/.test(__dernier()[1])].join('|');
    }), 'false|30|true');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('v13.249 — Fiches masquées : une seule règle (impression, grille, historique)');
    const { ctx, page, errors } = await openApp({ ...RESP,
      rpc: { get_resultats_light: [fiche(751, 'YERIGUE', 'YERIGUE'), fiche(752, 'admin', 'admin'), fiche(753, 'YERIGUE', 'nadia')],
             get_restriction_status: [{ id: 751, restricted_by: 'YERIGUE' }, { id: 752, restricted_by: 'admin' }, { id: 753, restricted_by: 'nadia' }],
             get_deleted_status: [] } });
    await page.waitForTimeout(600);
    const res = await page.evaluate(() => {
      [[751, 'YERIGUE'], [752, 'admin'], [753, 'nadia']].forEach(([id, par]) => {
        const x = _dbCache.find(f => f.id === id); if (x) x.restrictedBy = par; });
      _grilleInclureMasquees = true;
      const g = grilleSourceDB().map(x => x.id);
      return [751, 752, 753].map(id => [!!recordForOutput(id), g.includes(id),
        peutMasquerFiche(_dbCache.find(f => f.id === id))].join('/')).join(' ');
    });
    r.check('équipe : ouverte ; direction (créée ou masquée) : fermée — partout pareil', res, 'true/true/true false/false/false false/false/false');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('v13.249 — Normes à la connexion : une base remise à zéro s\'applique aux postes alignés');
    const { ctx, page, errors } = await openApp({ ...RESP, rpc: { get_refs_config: {} } });
    const lire = async (alignes) => {
      await page.evaluate((al) => {
        localStorage.setItem(LABO_REFS_KEY, JSON.stringify({ hb: { ref: '1-2', lo: 1, hi: 2, unit: 'g/dL' } }));
        if (al) localStorage.setItem('labosaisie_refs_v1_serveur', '1'); else localStorage.removeItem('labosaisie_refs_v1_serveur');
      }, alignes);
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1500);
      return page.evaluate(() => 'hb' in getCustomRefs());
    };
    r.check('poste jamais aligné : valeurs locales gardées', await lire(false), true);
    r.check('poste aligné : remise à zéro appliquée', await lire(true), false);
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

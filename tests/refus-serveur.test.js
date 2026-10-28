// ════════════════════════════════════════════════════════════════════
//  Refus du serveur (v13.270) — plus de succès affiché pour un refus.
//  La plupart des fonctions d'écriture du serveur REFUSENT par un code texte
//  (« forbidden », « unauthorized »…) sans lever d'erreur. L'appli ne lisait
//  que `error` : un encaissement refusé s'affichait « Payé », une annulation
//  refusée « non payé », un statut refusé « Terminé ». La file hors ligne
//  s'arrêtait au premier refus sans rien dire et jetait le masquage ou la
//  mise en corbeille d'un dossier créé hors ligne. Une corbeille non relue
//  faisait compter les dossiers supprimés comme actifs.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const PORT = 8377;
const AUJ = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
const fiche = (id, nom, patient) => ({ id, type: 'Dossier', montant: 3000, created_at: AUJ + 'T09:00:00Z',
  created_by: 'admin', patient: Object.assign({ nom, dossier: 'D' + id, date: AUJ }, patient || {}),
  resultats: {}, prescripteur_id: 1, est_bpn: false });
const FICHES = [
  fiche(71, 'NON PAYE'),
  fiche(72, 'MONNAIE DUE', { paiement_status: 'paye', paiement_infos: { montant_recu: 3500, monnaie: 500, monnaie_remise: false } }),
  fiche(73, 'PAYE TROIS', { paiement_status: 'paye', paiement_infos: { montant_recu: 3000 } }),
  fiche(74, 'PAYE QUATRE', { paiement_status: 'paye', paiement_infos: { montant_recu: 3000 } }),
];

async function ouvrir() {
  const o = await openApp({ role: 'admin', username: 'admin', port: PORT });
  await o.page.evaluate(fiches => {
    window.__rep = {}; window.__appels = []; window.__toasts = [];
    const toastOrig = window.toast;
    window.toast = (m, t) => { window.__toasts.push((t || '') + '|' + m); try { toastOrig(m, t); } catch (e) {} };
    window.showConfirmModal = async () => true;
    window.confirm = () => true;
    const ancien = _sb.rpc.bind(_sb);
    _sb.rpc = async (n, p) => {
      window.__appels.push({ n, p });
      const h = window.__rep[n];
      if (typeof h === 'function') return h(p);
      if (h !== undefined) return { data: h, error: null };
      if (n === 'get_resultats_light') return { data: JSON.parse(JSON.stringify(fiches)), error: null };
      return ancien(n, p);
    };
  }, FICHES);
  await o.page.evaluate(() => refreshDB(true));
  return o;
}
const viderToasts = page => page.evaluate(() => { window.__toasts = []; });
const toasts = page => page.evaluate(() => window.__toasts.join(' ¦ '));
const attendre = page => page.evaluate(() => new Promise(r => setTimeout(r, 50)));

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('REFUS DU SERVEUR — plus de faux succès');
  let erreurs = [];
  try {
    const { ctx, page, errors } = await ouvrir();

    // ── Encaissement ─────────────────────────────────────────────────
    r.section('Encaissement refusé (code texte, sans erreur)');
    await page.evaluate(async () => {
      window.__rep.update_dossier_patient = 'forbidden_paiement';
      ouvrirModalPaiement(71);
      await validerPaiement(71);
    });
    let t = await toasts(page);
    r.check('le dossier reste « non payé »', await page.evaluate(() => isDossierPaye(71)), false);
    r.check('motif affiché en rouge', /^err\|.*encaissement non autorisé/.test(t), true);
    r.check('pas de « Paiement enregistré »', /Paiement enregistré/.test(t), false);

    await viderToasts(page);
    await page.evaluate(async () => {
      window.__rep.update_dossier_patient = 'unauthorized';
      ouvrirModalPaiement(71);
      await validerPaiement(71);
    });
    t = await toasts(page);
    r.check('session expirée → « reconnectez-vous »', /reconnectez-vous/.test(t), true);
    r.check('toujours « non payé »', await page.evaluate(() => isDossierPaye(71)), false);

    await viderToasts(page);
    await page.evaluate(async () => {
      window.__rep.update_dossier_patient = () => { throw new TypeError('Failed to fetch'); };
      ouvrirModalPaiement(71);
      await validerPaiement(71);
    });
    t = await toasts(page);
    r.check('connexion perdue → retour en arrière', await page.evaluate(() => isDossierPaye(71)), false);
    r.check('connexion perdue dite', /connexion perdue/.test(t), true);

    await viderToasts(page);
    await page.evaluate(async () => {
      window.__rep.update_dossier_patient = 'ok';
      ouvrirModalPaiement(71);
      await validerPaiement(71);
    });
    t = await toasts(page);
    r.check('accepté → « Payé »', await page.evaluate(() => isDossierPaye(71)), true);
    r.check('« Paiement enregistré » après accord', /^ok\|.*Paiement enregistré/.test(t), true);

    // ── Annulation, monnaie : retour à l'état EXACT d'avant ──────────
    r.section('Annulation et monnaie refusées : état d\'avant');
    await viderToasts(page);
    const annul = await page.evaluate(async () => {
      window.__rep.update_dossier_patient = 'forbidden_annulation';
      const ok = await annulerPaiement(73);
      const p = _dbCache.find(x => x.id === 73).patient;
      return { ok, statut: getPaiementStatus(73), recu: p.paiement_infos && p.paiement_infos.montant_recu };
    });
    t = await toasts(page);
    r.check('annulation refusée → reste « Payé »', annul.statut, 'paye');
    r.check('infos de paiement conservées', annul.recu, 3000);
    r.check('pas de « Paiement annulé »', /Paiement annulé/.test(t), false);
    r.check('motif : réservée admin / caissier', /annulation réservée/.test(t), true);

    await viderToasts(page);
    const monnaie = await page.evaluate(async () => {
      window.__rep.update_dossier_patient = 'unauthorized';
      await marquerMonnaieRemise(72);
      return monnaieDue(72);
    });
    t = await toasts(page);
    r.check('monnaie refusée → toujours à rendre', monnaie, 500);
    r.check('pas de « Monnaie remise »', /Monnaie de .* remise/.test(t), false);

    // ── Annulation groupée ───────────────────────────────────────────
    r.section('Annulation groupée : seuls les accords comptent');
    await viderToasts(page);
    const lot = await page.evaluate(async () => {
      window.__rep.update_dossier_patient = p => ({ data: p.p_id === 73 ? 'ok' : 'forbidden_annulation', error: null });
      _selectedIds = new Set([73, 74]);
      await bulkAnnulerPaiement();
      return { s73: getPaiementStatus(73), s74: getPaiementStatus(74) };
    });
    t = await toasts(page);
    r.check('accepté → non payé', lot.s73, 'non_paye');
    r.check('refusé → reste payé', lot.s74, 'paye');
    r.check('bilan : 1 annulé · 1 non annulé + motif', /1 paiement\(s\) annulé\(s\) · 1 non annulé\(s\) : annulation réservée/.test(t), true);

    // ── Statut ───────────────────────────────────────────────────────
    r.section('Statut refusé');
    await viderToasts(page);
    const immediat = await page.evaluate(() => { window.__rep.set_dossier_statut = 'forbidden'; setStatut(71, 'urgent'); return getStatut(71); });
    r.check('affiché tout de suite (optimiste)', immediat, 'urgent');
    await attendre(page);
    t = await toasts(page);
    r.check('refus → statut d\'avant', await page.evaluate(() => getStatut(71)), 'attente');
    r.check('« Statut non enregistré » + motif', /Statut non enregistré : action non autorisée/.test(t), true);
    await page.evaluate(() => { window.__rep.set_dossier_statut = 'ok'; setStatut(71, 'urgent'); });
    await attendre(page);
    r.check('accepté → statut gardé', await page.evaluate(() => getStatut(71)), 'urgent');

    await viderToasts(page);
    const auto = await page.evaluate(async () => {
      window._completionActive = () => ({ complete: true });
      window.__rep.set_dossier_statut = 'forbidden';
      await _autoStatutApresSave(73);
      const refuse = getStatut(73);
      window.__rep.set_dossier_statut = 'ok';
      await _autoStatutApresSave(74);
      return { refuse, accepte: getStatut(74) };
    });
    t = await toasts(page);
    r.check('« Terminé » automatique refusé → pas Terminé', auto.refuse, 'attente');
    r.check('message : résultats enregistrés, pas Terminé', /Résultats enregistrés, mais dossier non marqué « Terminé »/.test(t), true);
    r.check('« Terminé » automatique accepté', auto.accepte, 'rendu');

    // ── Corbeille non relue ──────────────────────────────────────────
    r.section('Corbeille non relue : pas de dossier supprimé compté actif');
    await viderToasts(page);
    const corb = await page.evaluate(async () => {
      window.__rep.get_deleted_status = [{ id: 74, deleted_at: '2026-10-01T08:00:00Z', deleted_by: 'admin' }];
      window.__rep.get_restriction_status = [{ id: 73, restricted_by: 'admin' }];
      await refreshDB(true);
      const avant = { del: _dbCache.find(x => x.id === 74).deletedAt, restr: _dbCache.find(x => x.id === 73).restrictedBy };
      window.__appels = [];
      window.__rep.get_deleted_status = () => ({ data: null, error: { message: 'délai dépassé' } });
      window.__rep.get_restriction_status = () => ({ data: null, error: { message: 'délai dépassé' } });
      await refreshDB(true);
      return { avant, del: _dbCache.find(x => x.id === 74).deletedAt, restr: _dbCache.find(x => x.id === 73).restrictedBy,
        essais: window.__appels.filter(a => a.n === 'get_deleted_status').length };
    });
    t = await toasts(page);
    r.check('lecture normale : corbeille et masquage', !!corb.avant.del && corb.avant.restr === 'admin', true);
    r.check('échec : un second essai', corb.essais, 2);
    r.check('dossier en corbeille reste en corbeille', corb.del, '2026-10-01T08:00:00Z');
    r.check('dossier masqué reste masqué', corb.restr, 'admin');
    r.check('avertissement affiché', /Corbeille ou dossiers masqués non relus/.test(t), true);
    await page.evaluate(() => { delete window.__rep.get_deleted_status; delete window.__rep.get_restriction_status; });

    // ── File hors ligne ──────────────────────────────────────────────
    r.section('File hors ligne : refus dit, rien de perdu, rien de bloqué');
    await viderToasts(page);
    const file = await page.evaluate(async () => {
      const rec = nom => ({ type: 'Dossier', patient: { nom, dossier: 'H-' + nom.slice(-1) }, resultats: {}, montant: 0 });
      saveSyncQueue([
        { qid: 'i1', op: 'insert', tempId: 'tmp_A', record: rec('HORS LIGNE A'), est_bpn: false },
        { qid: 'a1', op: 'action', rpc: 'toggle_restriction', id: 'tmp_A' },
        { qid: 'i2', op: 'insert', tempId: 'tmp_B', record: rec('HORS LIGNE B'), est_bpn: false },
        { qid: 'a2', op: 'action', rpc: 'soft_delete_dossier', id: 'tmp_B' },
        { qid: 'a3', op: 'action', rpc: 'soft_delete_dossier', id: 73 },
        { qid: 'u1', op: 'update', id: 71, record: rec('MODIF HORS LIGNE'), est_bpn: false },
      ]);
      _dbCache.push({ id: 'tmp_A', type: 'Dossier', patient: { nom: 'HORS LIGNE A' }, resultats: {}, restrictedBy: 'admin', _pending: true });
      window.__rep.insert_resultat = p => p.p_patient.nom === 'HORS LIGNE A'
        ? { data: { id: 900, dossier: 'H-A' }, error: null }
        : { data: null, error: { message: 'journee_verrouillee : 2026-10-01' } };
      window.__rep.toggle_restriction = 'restricted';
      window.__rep.soft_delete_dossier = p => ({ data: p.p_id === 73 ? 'forbidden' : 'ok', error: null });
      window.__rep.update_resultat = p => ({ data: { id: 71, type: 'Dossier', patient: p.p_patient, resultats: {}, created_at: '2026-10-01T09:00:00Z', created_by: 'admin', montant: 0 }, error: null });
      window.__appels = [];
      await flushSyncQueue();
      const q = loadSyncQueue();
      const voir = document.getElementById('sync-banner-voir');
      return {
        reste: q.map(x => x.qid).join(','),
        echecs: q.filter(x => x.echec).map(x => x.qid + '=' + x.echec).join(' ; '),
        masqueSur: (window.__appels.find(a => a.n === 'toggle_restriction') || {}).p,
        updates: window.__appels.filter(a => a.n === 'update_resultat').length,
        cache900: (_dbCache.find(x => x.id === 900) || {}).restrictedBy,
        banniere: document.getElementById('sync-banner-label').textContent,
        voirVisible: voir && voir.style.display !== 'none',
      };
    });
    t = await toasts(page);
    r.check('masquage hors ligne rejoué sur le vrai n°', file.masqueSur && file.masqueSur.p_id, 900);
    r.check('le dossier synchronisé reste masqué', file.cache900, 'admin');
    r.check('refus suivant n\'arrête pas la file (modif. passée)', file.updates, 1);
    r.check('restent : refusés + action qui attend sa fiche', file.reste, 'i2,a2,a3');
    r.check('motifs gardés', /i2=journée verrouillée/.test(file.echecs) && /a3=action non autorisée/.test(file.echecs), true);
    r.check('message rouge : patient, opération, motif', /^err\|.*HORS LIGNE B \(création\) : journée verrouillée \(et 1 autre\)/.test(t), true);
    r.check('bannière : « 2 refusés par le serveur »', /2 refusés par le serveur/.test(file.banniere), true);
    r.check('bouton « Voir les refus » visible', file.voirVisible, true);

    const modale = await page.evaluate(() => {
      voirFileSynchro();
      const bd = document.getElementById('sync-file-bd');
      return bd ? bd.textContent.replace(/\s+/g, ' ') : '';
    });
    r.check('liste des refus : B et dossier 73', /HORS LIGNE B \(création\)/.test(modale) && /PAYE TROIS \(mise en corbeille\)/.test(modale), true);

    const retrait = await page.evaluate(async () => {
      let copie = null;
      const vraiCreate = URL.createObjectURL;
      URL.createObjectURL = b => { copie = b; return 'blob:faux'; };
      const vraiClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      await retirerDeLaFile('i2');
      URL.createObjectURL = vraiCreate; HTMLAnchorElement.prototype.click = vraiClick;
      return { reste: loadSyncQueue().map(x => x.qid).join(','), copie: copie ? await copie.text() : '' };
    });
    r.check('retirer : copie téléchargée d\'abord', /HORS LIGNE B/.test(retrait.copie), true);
    r.check('retirer : la fiche et son action partent', retrait.reste, 'a3');

    erreurs = erreurs.concat(errors);
    await ctx.close();

    // ── Sauvegarde : date non notée ──────────────────────────────────
    {
      const o = await ouvrir();
      r.section('Sauvegarde : date refusée par le serveur');
      const msg = await o.page.evaluate(async () => {
        window.__rep.get_resultats = [];
        window.__rep.enregistrer_sauvegarde = 'forbidden';
        const vraiCreate = URL.createObjectURL;
        URL.createObjectURL = () => 'blob:faux';
        const vraiClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {};
        window.__toasts = [];
        await sauvegarderBase();
        URL.createObjectURL = vraiCreate; HTMLAnchorElement.prototype.click = vraiClick;
        return window.__toasts.join(' ¦ ');
      });
      r.check('fichier fait, mais date non notée (rouge)', /^err\|.*date n'est pas notée sur le serveur \(action non autorisée/.test(msg), true);
      erreurs = erreurs.concat(o.errors);
      await o.ctx.close();
    }

    r.check('aucune erreur JS', erreurs.length, 0);
    if (erreurs.length) console.log(erreurs);
  } catch (e) {
    console.error(e);
    r.check('exécution sans exception', String(e && e.message || e), 'aucune');
  }
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

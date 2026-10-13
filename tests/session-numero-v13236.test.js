// ════════════════════════════════════════════════════════════════════
//  v13.236 — corrections de la vérification générale (côté appli)
//    1. Renouvellement de session : une ERREUR ne déconnecte plus l'agent ;
//       seul un refus explicite (jeton null) le fait. Le résultat de la RPC
//       est un TABLEAU [{ token }] (RETURNS TABLE).
//    2. Numéro de dossier déjà pris : le numéro attribué par le serveur est
//       reporté dans la fiche (en ligne ET au rejeu de la file hors-ligne),
//       et l'agent est prévenu.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8264);
  const r = createReporter('SESSION & NUMÉRO DE DOSSIER (v13.236)');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'YERIGUE', port: 8264,
                                                cible: process.env.CIBLE || '/index.html' });

  // ── 1. Renouvellement de session ────────────────────────────────────
  r.section('Renouvellement de session');
  const sess = await page.evaluate(async () => {
    let tick = null;
    const vraiSI = window.setInterval;
    window.setInterval = (fn) => { tick = fn; return 1; };
    window.__logout = 0; window.doLogout = () => { window.__logout++; };
    window.toast = () => {};
    const vraiST = window.setTimeout; window.setTimeout = (fn) => { fn(); return 1; };
    startTokenRefresh();
    window.setInterval = vraiSI;
    const out = {};
    const essai = async (rep) => { _sb.rpc = async () => rep; window.__logout = 0; await tick(); return window.__logout; };
    out.erreurServeur = await essai({ data: null, error: { message: 'column reference "token" is ambiguous' } });
    _currentUser.token = 'ancien';
    out.okTableau = await essai({ data: [{ token: 'nouveau' }], error: null });
    out.jetonApres = _currentUser.token;
    out.refus = await essai({ data: [{ token: null }], error: null });
    window.setTimeout = vraiST;
    return out;
  });
  r.check('erreur serveur/réseau → PAS de déconnexion', sess.erreurServeur, 0);
  r.check('réponse [{token}] acceptée (pas de déconnexion)', sess.okTableau, 0);
  r.check('jeton mis à jour depuis le tableau', sess.jetonApres, 'nouveau');
  r.check('refus explicite (token null) → déconnexion', sess.refus, 1);

  // ── 2. Numéro attribué par le serveur ───────────────────────────────
  r.section('Numéro de dossier déjà pris — en ligne');
  const enLigne = await page.evaluate(async () => {
    window.__toasts = []; window.toast = m => window.__toasts.push(String(m));
    _sb.rpc = async (nom) => nom === 'insert_resultat'
      ? { data: { id: 501, dossier: '0007-1026', renumerote: true, dossier_demande: '0001-1026' }, error: null }
      : { data: [], error: null };
    const rec = { type: 'Dossier', patient: { nom: 'ALI AMADOU', dossier: '0001-1026' }, resultats: {}, montant: 7500 };
    const saved = await insertRecordRemote(rec);
    return { dossier: saved.patient.dossier, initial: saved.patient.dossier_initial,
             cache: (_dbCache.find(x => x.id === 501) || {}).patient?.dossier,
             alerte: window.__toasts.some(t => /0001-1026.*déjà pris.*0007-1026/.test(t)) };
  });
  r.check('la fiche prend le numéro attribué', enLigne.dossier, '0007-1026');
  r.check('l\'ancien numéro est gardé (dossier_initial)', enLigne.initial, '0001-1026');
  r.check('le cache local est à jour', enLigne.cache, '0007-1026');
  r.check('l\'agent est prévenu', enLigne.alerte, true);

  const libre = await page.evaluate(async () => {
    window.__toasts = [];
    _sb.rpc = async () => ({ data: { id: 502, dossier: '0008-1026', renumerote: false }, error: null });
    const saved = await insertRecordRemote({ type: 'Dossier', patient: { nom: 'X', dossier: '0008-1026' }, resultats: {}, montant: 0 });
    return { dossier: saved.patient.dossier, initial: saved.patient.dossier_initial || null, alertes: window.__toasts.length };
  });
  r.check('numéro libre : inchangé', libre.dossier, '0008-1026');
  r.check('numéro libre : pas d\'ancien numéro', libre.initial, null);
  r.check('numéro libre : aucune alerte', libre.alertes, 0);

  r.section('Numéro de dossier déjà pris — rejeu hors-ligne');
  const horsLigne = await page.evaluate(async () => {
    window.__toasts = [];
    const pend = enqueueInsert({ type: 'Dossier', patient: { nom: 'RIANA SAHARIA', dossier: '0002-1026' }, resultats: {}, montant: 7500 }, false);
    _sb.rpc = async (nom) => nom === 'insert_resultat'
      ? { data: { id: 503, dossier: '0009-1026', renumerote: true, dossier_demande: '0002-1026' }, error: null }
      : { data: [], error: null };
    await flushSyncQueue(true);
    const rec = _dbCache.find(x => x.id === 503) || {};
    return { tmpRestant: _dbCache.some(x => x.id === pend.id), dossier: rec.patient?.dossier,
             initial: rec.patient?.dossier_initial,
             alerte: window.__toasts.some(t => /0002-1026.*déjà pris.*0009-1026/.test(t)) };
  });
  r.check('la fiche temporaire est remplacée', horsLigne.tmpRestant, false);
  r.check('le numéro attribué est repris au rejeu', horsLigne.dossier, '0009-1026');
  r.check('l\'ancien numéro est gardé', horsLigne.initial, '0002-1026');
  r.check('l\'agent est prévenu', horsLigne.alerte, true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 4));
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

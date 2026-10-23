// v13.256 — Deux données qui ne vivaient que sur un appareil passent sur la base.
//   1) Valeurs de référence : la base est la référence ; un poste qui garde de
//      vraies modifications les propose à l'administrateur (liste + confirmation)
//      pour les enregistrer sur la base, une seule fois ; sinon il s'aligne —
//      ses anciennes valeurs sont gardées de côté.
//   2) « Envoyé au labo externe » (électrophorèses) : lu et écrit sur la base,
//      ancien marqueur local repris une fois.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8361;
const CIBLE = process.env.CIBLE || '/index.html';
// Format par profil (v13.257) : Hb réglée pour la femme adulte.
const HB = { hb: { p: { ADULTE_F: { ref: '1-2', lo: 1, hi: 2 } } } };
const GLU = { glu: { ref: '0,7-1,1', lo: 0.7, hi: 1.1, unit: 'g/L' } };

// Rejoue _chargerRefsDepuisBase avec un serveur scripté. `rep` : nom → réponse
// (ou liste de réponses successives). `confirmer` : réponse à la question.
// Renvoie l'état du poste après coup.
const scenario = (page, { local, aligne, rep, confirmer = false }) => page.evaluate(async ({ local, aligne, rep, confirmer }) => {
  if (local === 'DEFAUTS') {                   // valeur réglée identique au référentiel du profil
    const d = _getRefBase('hb', { tranche: 'ADULTE', sexe: 'F' });
    local = { hb: { unit: 'g/dL', p: { ADULTE_F: { ref: d.ref, lo: d.lo, hi: d.hi } } } };
  }
  if (local === 'ANCIEN') local = { hb: { ref: '13-18', lo: 13, hi: 18, unit: 'g/dL' } };   // avant v13.257
  [LABO_REFS_AVANT_BASE_KEY, LABO_REFS_SIGNALE_KEY, 'labo_anomalies_attente'].forEach(k => localStorage.removeItem(k));
  localStorage.setItem(LABO_REFS_KEY, JSON.stringify(local));
  if (aligne) localStorage.setItem(LABO_REFS_SYNC_KEY, '1'); else localStorage.removeItem(LABO_REFS_SYNC_KEY);
  _customRefsCache = null;
  const appels = []; const vrai = _sb.rpc.bind(_sb); const vraiConfirm = window.confirm;
  let question = '';
  window.confirm = (t) => { question = t; return confirmer; };
  const vus = {};
  _sb.rpc = (n, p) => {
    appels.push(n + (n === 'init_refs_config' ? ':' + (Object.keys(p.p_refs || {}).join(',') || '{}') : ''));
    if (n === 'log_anomalie') return Promise.resolve({ data: 'ok', error: null });
    let v = rep[n];
    if (Array.isArray(v)) { vus[n] = (vus[n] || 0); v = v[Math.min(vus[n]++, v.length - 1)]; }
    if (v === 'ERREUR') return Promise.resolve({ data: null, error: { message: 'réseau' }, status: 0 });
    return Promise.resolve({ data: v === undefined ? null : v, error: null });
  };
  try { await _chargerRefsDepuisBase(); } finally { _sb.rpc = vrai; window.confirm = vraiConfirm; }
  await new Promise(r => setTimeout(r, 50));
  let sauve = null; try { sauve = JSON.parse(localStorage.getItem(LABO_REFS_AVANT_BASE_KEY) || 'null'); } catch (e) {}
  return {
    cles: Object.keys(getCustomRefs()).join(',') || '∅',
    stocke: Object.keys(JSON.parse(localStorage.getItem(LABO_REFS_KEY) || '{}')).join(',') || '∅',
    aligne: localStorage.getItem(LABO_REFS_SYNC_KEY) === '1',
    sauve: sauve ? Object.keys(sauve.refs || {}).join(',') : '∅',
    appels: appels.join(' '),
    question,
    signale: localStorage.getItem(LABO_REFS_SIGNALE_KEY) === '1',
  };
}, { local, aligne, rep, confirmer });

const ficheElectro = (id, nom) => ({
  id, type: 'Dossier', montant: 0, savedAt: new Date().toISOString(), _light: false,
  patient: { nom, dossier: '0' + id + '-1026', date: new Date().toISOString().slice(0, 10) },
  resultats: { _examens_coches: { 'Hématologie': ["Électrophorèse de l'hémoglobine"] }, 'Hématologie': {} },
});

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('DONNÉES PARTAGÉES SUR LA BASE (v13.256)');
  let erreurs = [];
  {
    r.section('Valeurs de référence à la connexion');
    const { ctx, page, errors } = await openApp({ role: 'responsable', username: 'Responsable', userId: 5, port: PORT, cible: CIBLE });
    let s = await scenario(page, { local: { ...HB, ...GLU }, aligne: false, confirmer: true,
      rep: { get_refs_config_v2: {}, init_refs_config: ['vide', 'ok'] } });
    r.check('base jamais remplie : sonde puis envoi après accord', s.appels, 'get_refs_config_v2 init_refs_config:{} init_refs_config:hb,glu');
    r.check('  la question liste les valeurs modifiées, avec le profil', /Adulte, femme\) : 1-2 g\/dL/.test(s.question) && /0,7-1,1/.test(s.question), true);
    r.check('  valeurs du poste gardées', s.cles, 'hb,glu');
    r.check('  poste désormais aligné sur la base', s.aligne, true);

    s = await scenario(page, { local: HB, aligne: false, confirmer: false,
      rep: { get_refs_config_v2: {}, init_refs_config: 'vide' } });
    r.check('« Annuler » : rien envoyé, rien changé', s.appels + ' / ' + s.cles + ' ' + s.aligne, 'get_refs_config_v2 init_refs_config:{} / hb false');

    s = await scenario(page, { local: 'DEFAUTS', aligne: false, rep: { get_refs_config_v2: {} } });
    r.check('lignes non modifiées : pas de question, aligné', s.appels + ' ' + s.aligne + ' ' + (s.question ? 'question' : '-'), 'get_refs_config_v2 true -');

    s = await scenario(page, { local: 'ANCIEN', aligne: false, rep: { get_refs_config_v2: {} } });
    r.check('ancienne valeur sans âge ni sexe : jamais envoyée', s.appels + ' ' + (s.question ? 'question' : '-'), 'get_refs_config_v2 -');
    r.check('  gardée de côté (affichée dans l\'éditeur)', s.sauve, 'hb');

    s = await scenario(page, { local: HB, aligne: false, rep: { get_refs_config_v2: [{}, GLU], init_refs_config: 'deja_defini' } });
    r.check('base déjà choisie : pas de question, on s\'aligne', s.cles + '/' + s.stocke + ' ' + (s.question ? 'question' : '-'), 'glu/glu -');
    r.check('  anciennes valeurs du poste gardées de côté', s.sauve, 'hb');
    r.check('  aligné', s.aligne, true);

    s = await scenario(page, { local: HB, aligne: false, confirmer: true,
      rep: { get_refs_config_v2: [{}, GLU], init_refs_config: ['vide', 'deja_defini'] } });
    r.check('course (un autre poste a rempli entre-temps) : aligné', s.cles + ' ' + s.aligne, 'glu true');

    s = await scenario(page, { local: HB, aligne: false, rep: { get_refs_config_v2: [{}, {}], init_refs_config: 'deja_defini' } });
    r.check('base remise « par défaut » par quelqu\'un : appliquée', s.cles, '∅');
    r.check('  valeurs du poste gardées de côté', s.sauve, 'hb');

    s = await scenario(page, { local: HB, aligne: false, rep: { get_refs_config_v2: GLU } });
    r.check('base remplie : prise telle quelle, sans sonde', s.cles + ' ' + s.appels, 'glu get_refs_config_v2');
    r.check('  valeurs du poste gardées de côté', s.sauve, 'hb');

    s = await scenario(page, { local: GLU, aligne: false, rep: { get_refs_config_v2: GLU } });
    r.check('valeurs du poste = base : rien à garder de côté', s.sauve, '∅');

    s = await scenario(page, { local: {}, aligne: false, rep: { get_refs_config_v2: {} } });
    r.check('poste sans valeurs : aligné, sans sonde', s.aligne + ' ' + s.appels, 'true get_refs_config_v2');

    s = await scenario(page, { local: HB, aligne: true, rep: { get_refs_config_v2: {} } });
    r.check('poste aligné : la remise à zéro de la base s\'applique', s.cles + ' ' + s.appels, '∅ get_refs_config_v2');

    s = await scenario(page, { local: HB, aligne: false, rep: { get_refs_config_v2: 'ERREUR' } });
    r.check('serveur injoignable : valeurs du poste intactes', s.cles + ' ' + s.aligne, 'hb false');

    s = await scenario(page, { local: HB, aligne: false, confirmer: true, rep: { get_refs_config_v2: {}, init_refs_config: ['vide', 'ERREUR'] } });
    r.check('envoi impossible : on réessaiera (rien changé)', s.cles + ' ' + s.aligne, 'hb false');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Compte sans droit sur les normes (agent)');
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'agent1', userId: 2, port: PORT, cible: CIBLE });
    let s = await scenario(page, { local: HB, aligne: false, rep: { get_refs_config_v2: {}, init_refs_config: 'forbidden' } });
    r.check('valeurs du poste gardées, pas de question', s.cles + ' ' + s.aligne + ' ' + (s.question ? 'question' : '-'), 'hb false -');
    r.check('administrateur averti (journal des anomalies)', s.appels.includes('log_anomalie') && s.signale, true);
    s = await page.evaluate(async () => {
      const appels = []; const vrai = _sb.rpc.bind(_sb);
      _sb.rpc = (n) => { appels.push(n); return Promise.resolve({ data: n === 'get_refs_config_v2' ? {} : 'forbidden', error: null }); };
      try { await _chargerRefsDepuisBase(); } finally { _sb.rpc = vrai; }
      await new Promise(r => setTimeout(r, 50));
      return appels.includes('log_anomalie');
    });
    r.check('averti une seule fois par poste', s, false);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Connexion réelle : le poste alimente la base');
    const appels = [];
    const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE, appels,
      rpc: { get_refs_config_v2: {}, init_refs_config: 'vide' } });
    await page.evaluate((hb) => { localStorage.setItem(LABO_REFS_KEY, JSON.stringify(hb)); localStorage.removeItem(LABO_REFS_SYNC_KEY); }, HB);
    let question = '';
    page.on('dialog', d => { question = d.message(); d.accept(); });
    appels.length = 0;
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1800);
    r.check('question posée au démarrage', /tous les postes/.test(question) && /Adulte, femme\) : 1-2 g\/dL/.test(question), true);
    r.check('sonde puis envoi', appels.filter(n => n === 'init_refs_config').length, 2);
    r.check('valeurs toujours appliquées (femme adulte)', await page.evaluate(() => getRef('hb', { tranche: 'ADULTE', sexe: 'F' }).ref), '1-2');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Électrophorèses : « Envoyé » commun à tous les postes');
    const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE });
    // Même domaine que la production : le lien de test range ses données à part.
    r.check('clés du site (test séparé de la production)',
      await page.evaluate(() => [LABO_REFS_KEY, LABO_REFS_SYNC_KEY, _ELEC_ENVOYE_KEY].join(' ')),
      CIBLE.includes('/preview/')
        ? 'labosaisie_refs_v1_test labosaisie_refs_v1_serveur_test labosaisie_electro_envoye_v1_test'
        : 'labosaisie_refs_v1 labosaisie_refs_v1_serveur labosaisie_electro_envoye_v1');
    // Serveur scripté : marqueurs en base + journal des appels.
    await page.evaluate((fiches) => {
      _dbCache.push(...fiches);
      window.__envoyes = { '7101': { par: 'admin', le: '2026-10-22T10:00:00Z' } };
      window.__appels = []; window.__refus = false;
      const vrai = _sb.rpc.bind(_sb);
      _sb.rpc = (n, p) => {
        if (n === 'get_electro_envoyes') {
          window.__appels.push(n + ':' + p.p_ids.join(','));
          const o = {}; p.p_ids.forEach(i => { if (window.__envoyes[i]) o[i] = window.__envoyes[i]; });
          return Promise.resolve({ data: o, error: null });
        }
        if (n === 'marquer_electro_envoye') {
          window.__appels.push(n + ':' + p.p_ids.join(',') + '=' + p.p_envoye);
          if (window.__refus) return Promise.resolve({ data: 'forbidden', error: null });
          p.p_ids.forEach(i => { if (p.p_envoye) window.__envoyes[i] = { par: 'admin' }; else delete window.__envoyes[i]; });
          return Promise.resolve({ data: 'ok', error: null });
        }
        return vrai(n, p);
      };
    }, [ficheElectro(7101, 'ELEC DEJA ENVOYE'), ficheElectro(7102, 'ELEC A ENVOYER'), ficheElectro(7103, 'ELEC ANCIEN LOCAL')]);
    // Ancien marqueur gardé sur l'appareil (avant v13.256).
    await page.evaluate(() => localStorage.setItem(_ELEC_ENVOYE_KEY, JSON.stringify({ 7103: true })));
    const etat = () => page.evaluate(() => {
      const ligne = id => [...document.querySelectorAll('#electro-apercu tbody tr')].find(tr => tr.querySelector('#elec-prof-' + id));
      return [7101, 7102, 7103].map(id => { const l = ligne(id); const c = l && l.querySelector('td input[type=checkbox]');
        return id + ':' + (c ? (c.checked ? 'oui' : 'non') : '?') + (l && /✈ envoyé/.test(l.textContent) ? '✈' : ''); }).join(' ');
    });
    await page.evaluate(async () => { showView('historique'); choisirListeHistorique('electro'); await renderElectro(); });
    r.check('marqueurs lus sur la base + ancien local repris', await etat(), '7101:oui✈ 7102:non 7103:oui✈');
    r.check('ancien marqueur local envoyé puis effacé', await page.evaluate(() =>
      window.__appels.includes('marquer_electro_envoye:7103=true') && localStorage.getItem(_ELEC_ENVOYE_KEY) === null), true);

    // Coche réussie : enregistrée sur la base, visible des autres postes.
    await page.evaluate(async () => {
      const c = [...document.querySelectorAll('#electro-apercu tbody tr')].find(tr => tr.querySelector('#elec-prof-7102')).querySelector('input[type=checkbox]');
      c.checked = true; await toggleElectroEnvoye(7102, true, c);
    });
    r.check('coche enregistrée sur la base', await page.evaluate(() => !!window.__envoyes[7102]), true);
    await page.evaluate(async () => { await renderElectro(); });
    r.check('relue après rechargement de la liste', await etat(), '7101:oui✈ 7102:oui✈ 7103:oui✈');

    // Refus du serveur : la case revient comme avant + message.
    const refus = await page.evaluate(async () => {
      window.__refus = true;
      const c = [...document.querySelectorAll('#electro-apercu tbody tr')].find(tr => tr.querySelector('#elec-prof-7101')).querySelector('input[type=checkbox]');
      c.checked = false; await toggleElectroEnvoye(7101, false, c);
      window.__refus = false;
      return { case: c.checked, base: !!window.__envoyes[7101], memo: _elecEstEnvoye(7101),
               toast: /non enregistré/.test(document.body.innerText) };
    });
    r.check('refus : case remise cochée', refus.case, true);
    r.check('refus : base et mémoire inchangées', refus.base && refus.memo, true);
    r.check('refus : message affiché', refus.toast, true);

    // Profil saisi depuis la liste : le marqueur est retiré sur la base.
    await page.evaluate(async () => {
      const vrai = _sb.rpc.bind(_sb);
      const fait = Object.assign({}, _dbCache.find(x => x.id === 7101));
      fait.resultats = { ...fait.resultats, 'Hématologie': { 'Profil Hb': 'Profil AA (Normal)' } };
      _sb.rpc = (n, p) => n === 'update_resultat' ? Promise.resolve({ data: fait, error: null }) : vrai(n, p);
      document.getElementById('elec-prof-7101').value = 'Profil AA (Normal)';
      try { await enregistrerElectroResultat(7101); } finally { _sb.rpc = vrai; }
      await new Promise(r => setTimeout(r, 100));
    });
    r.check('profil rendu : marqueur retiré sur la base', await page.evaluate(() =>
      window.__appels.includes('marquer_electro_envoye:7101=false') && !window.__envoyes[7101]), true);

    // Impression : la mention « (envoyé) » vient de la base.
    const imprime = await page.evaluate(async () => {
      const p = window.print; window.print = () => {};
      try { await imprimerElectro(); } finally { window.print = p; }
      return [...document.querySelectorAll('#print-render tbody .el-nom')].map(td => td.textContent).join(' | ');
    });
    r.check('impression : « (envoyé) » selon la base', imprime, 'ELEC A ENVOYER (envoyé) | ELEC ANCIEN LOCAL (envoyé)');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  r.check('aucune erreur de page', erreurs.join(' | ') || 'aucune', 'aucune');
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

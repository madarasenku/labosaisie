// v13.257 — Valeurs de référence personnalisées PAR PROFIL (âge + sexe).
//
// Avant : une seule colonne par paramètre ; une valeur réglée remplaçait celle
// de tous les âges et des deux sexes, et un clic sur « Enregistrer » figeait
// ~70 paramètres d'un coup (Hb femme 13–17 au lieu de 12–16, Hb nouveau-né
// 13–17…). On vérifie : profils indépendants, seules les lignes changées
// enregistrées, ancien format sans âge ni sexe plus appliqué (mais montré),
// remises à zéro par profil, et le compte rendu qui suit le profil du patient.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8362;
const CIBLE = process.env.CIBLE || '/index.html';

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('NORMES PAR PROFIL (ÂGE + SEXE)');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE, rpc: { save_refs_config: 'ok' } });

  // Outils dans la page : configuration posée, éditeur ouvert, envoi capturé.
  await page.evaluate(() => {
    window.__poser = (cfg, tranche = 'ADULTE', sexe = 'F') => {
      localStorage.setItem(LABO_REFS_KEY, JSON.stringify(cfg));
      [LABO_REFS_ANCIENNES_KEY, LABO_REFS_AVANT_BASE_KEY].forEach(k => localStorage.removeItem(k));
      _customRefsCache = null; _refsProfil = { tranche, sexe };
      showView('comptes'); buildRefsEditor();
    };
    window.__envois = [];
    const vrai = _sb.rpc.bind(_sb);
    _sb.rpc = (n, p) => { if (n === 'save_refs_config') window.__envois.push(p.p_refs); return vrai(n, p); };
    window.__ref = (id, tranche, sexe) => { const x = getRef(id, { tranche, sexe }); return x ? x.ref : null; };
    window.__saisir = (id, ref, lo, hi) => {
      document.getElementById('rref_' + id).value = ref;
      document.getElementById('rlo_' + id).value = lo;
      document.getElementById('rhi_' + id).value = hi;
    };
  });

  r.section('Référentiel par défaut (rien de réglé)');
  const ref0 = await page.evaluate(() => { __poser({});
    return [__ref('hb', 'ADULTE', 'F'), __ref('hb', 'ADULTE', 'M'), __ref('hb', 'NN', 'F'), __ref('gbc', 'ENFANT', 'M'), __ref('hb', 'ADULTE', '')].join(' | '); });
  r.check('Hb femme / homme / nouveau-né, GB enfant, sexe inconnu', ref0, '12–16 | 13–17 | 13.5–21 | 5–15 | 13–17 / 12–16');
  r.check('l\'éditeur montre le référentiel du profil (créat. femme 6–11)', await page.evaluate(() =>
    document.getElementById('rref_hb').value + ' ' + document.getElementById('rref_crea').value), '12–16 6–11');
  r.check('choix du profil présent (6 âges × 2 sexes)', await page.evaluate(() =>
    document.querySelectorAll('#refs-profil-tranche option').length + 'x' + document.querySelectorAll('#refs-profil-sexe option').length), '6x2');

  r.section('Enregistrer : seule la ligne changée, pour ce profil');
  const env = await page.evaluate(async () => {
    __poser({}); __envois.length = 0;
    __saisir('hb', '11.5–15.5', '11.5', '15.5');
    await _saveRefsConfig();
    return JSON.stringify(__envois[0]);
  });
  r.check('un seul paramètre envoyé (et non 70)', env, '{"hb":{"p":{"ADULTE_F":{"ref":"11.5–15.5","lo":11.5,"hi":15.5}}}}');
  const apres = await page.evaluate(() => [__ref('hb', 'ADULTE', 'F'), __ref('hb', 'ADULTE', 'M'), __ref('hb', 'NN', 'F'),
    __ref('hb', 'SENIOR', 'F'), __ref('hb', 'ADULTE', '')].join(' | '));
  r.check('femme adulte changée ; homme, nouveau-né, senior intacts', apres, '11.5–15.5 | 13–17 | 13.5–21 | 12–16 | 13–17 / 11.5–15.5');
  r.check('interprétation selon le profil (Hb 12 : femme Normal, homme Bas)', await page.evaluate(() => {
    const f = getRef('hb', { tranche: 'ADULTE', sexe: 'F' }), m = getRef('hb', { tranche: 'ADULTE', sexe: 'M' });
    return interprete('12', f.lo, f.hi) + '/' + interprete('12', m.lo, m.hi); }), 'Normal/Bas');

  r.section('Autre profil : valeurs propres, sans toucher au premier');
  const homme = await page.evaluate(async () => {
    __envois.length = 0;
    document.getElementById('refs-profil-sexe').value = 'M'; choisirProfilRefs();
    const affiche = document.getElementById('rref_hb').value;
    __saisir('hb', '13.5–17.5', '13.5', '17.5');
    await _saveRefsConfig();
    return [affiche, Object.keys(getCustomRefs().hb.p).sort().join(','), __ref('hb', 'ADULTE', 'F'), __ref('hb', 'ADULTE', 'M')].join(' | ');
  });
  r.check('homme : référentiel affiché, puis réglé à part', homme, '13–17 | ADULTE_F,ADULTE_M | 11.5–15.5 | 13.5–17.5');
  r.check('compte rendu : référence selon le patient', await page.evaluate(() => {
    const hb = HEMA_PARAMS.find(p => p.id === 'hb');
    return [refDisplayFor(hb, profileFromPatient({ age: '30', sexe: 'F' })), refDisplayFor(hb, profileFromPatient({ age: '30', sexe: 'M' })),
            refDisplayFor(hb, profileFromPatient({ age: '10 jours', sexe: 'F' }))].join(' | '); }), '11.5–15.5 | 13.5–17.5 | 13.5–21');

  r.section('Changer de profil avec une saisie non enregistrée');
  const garde = await page.evaluate(() => {
    window.confirm = () => false;
    document.getElementById('rref_hb').value = 'en cours';
    document.getElementById('refs-profil-tranche').value = 'ENFANT'; choisirProfilRefs();
    const r1 = [_refsProfil.tranche, document.getElementById('refs-profil-tranche').value, document.getElementById('rref_hb').value].join(',');
    window.confirm = () => true;
    document.getElementById('refs-profil-tranche').value = 'ENFANT'; choisirProfilRefs();
    return r1 + ' → ' + _refsProfil.tranche + ',' + document.getElementById('rref_hb').value;
  });
  r.check('« Annuler » garde le profil et la saisie ; « OK » change', garde, 'ADULTE,ADULTE,en cours → ENFANT,11.5–15.5');

  r.section('Remises à zéro : pour le profil affiché');
  const raz = await page.evaluate(async () => {
    __poser({ hb: { p: { ADULTE_F: { ref: '1-2', lo: 1, hi: 2 }, ADULTE_M: { ref: '3-4', lo: 3, hi: 4 } } } }, 'ADULTE', 'F');
    await resetOneRef('hb');
    return Object.keys((getCustomRefs().hb || {}).p || {}).join(',') + ' | ' + __ref('hb', 'ADULTE', 'F');
  });
  r.check('↺ d\'une ligne : femme remise, homme gardé', raz, 'ADULTE_M | 12–16');
  const razSec = await page.evaluate(async () => {
    __poser({ hb: { p: { ADULTE_F: { ref: '1-2', lo: 1, hi: 2 }, NN_F: { ref: '5-6', lo: 5, hi: 6 } } }, gbc: { p: { ADULTE_F: { ref: '7-8', lo: 7, hi: 8 } } } }, 'ADULTE', 'F');
    window.confirm = () => true;
    await resetSectionRefs('nfs');
    return Object.keys(getCustomRefs()).map(id => id + ':' + Object.keys(getCustomRefs()[id].p).join('+')).join(' ');
  });
  r.check('↺ Section : ce profil remis, nouveau-né gardé', razSec, 'hb:NN_F');

  r.section('Paramètres identiques pour tous (« tous profils »)');
  const tous = await page.evaluate(async () => {
    __poser({}, 'ENFANT', 'M'); __envois.length = 0;
    __saisir('widal_to', '1/160', '160', '9999');
    await _saveRefsConfig();
    return [JSON.stringify(__envois[0].widal_to), refPersoPour('widal_to').lo,
            /tous profils/.test(document.getElementById('rref_widal_to').closest('tr').textContent)].join(' | ');
  });
  r.check('Widal : réglé une fois pour tous', tous, '{"p":{"*":{"ref":"1/160","lo":160,"hi":9999}}} | 160 | true');
  r.check('sections Fer, cardiaque, hormones, autres : enfin enregistrées', await page.evaluate(async () => {
    __poser({}); __envois.length = 0;
    const ids = ['bio_fer', 'bio_card', 'bio_horm', 'bio_autre'].map(s => _refsIdsSection(s)[0]).filter(Boolean);
    ids.forEach(id => { document.getElementById('rref_' + id).value = 'réglé ' + id; });
    await _saveRefsConfig();
    return ids.length + ':' + ids.every(id => __envois[0] && __envois[0][id]);
  }), '4:true');

  r.section('Ancien format (sans âge ni sexe)');
  const ancien = await page.evaluate(() => {
    __poser({ hb: { ref: '13-18', lo: 13, hi: 18, unit: 'g/dL' }, widal_th: { ref: '1/320', lo: 320, hi: 9999, unit: 'dilution' } });
    const txt = document.getElementById('refs-editor-grid').innerText;
    return [__ref('hb', 'ADULTE', 'F'), __ref('hb', 'NN', 'M'), refPersoPour('widal_th').lo,
            /Anciennes valeurs de ce poste/.test(txt) && /13-18/.test(txt)].join(' | ');
  });
  r.check('Hb ancienne plus appliquée ; Widal (commun) gardé ; liste affichée', ancien, '12–16 | 13.5–21 | 320 | true');
  const ancienApres = await page.evaluate(async () => {
    __envois.length = 0; await _saveRefsConfig();
    return [Object.keys(__envois[0]).sort().join(','), /13-18/.test(document.getElementById('refs-editor-grid').innerText)].join(' | ');
  });
  r.check('enregistrer : ancienne valeur non envoyée, toujours montrée', ancienApres, 'widal_th | true');
  r.check('« Ne plus afficher » efface la liste', await page.evaluate(() => {
    window.confirm = () => true; oublierRefsAnciennes();
    return /Anciennes valeurs de ce poste/.test(document.getElementById('refs-editor-grid').innerText); }), false);

  r.check('aucune erreur de page', errors.join(' | ') || 'aucune', 'aucune');
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

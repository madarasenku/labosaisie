// ✅ v13.225/226 — UNE SEULE pastille de statut par ligne, qui dit l'AVANCEMENT.
//
// Avant v13.225 : deux badges par ligne (avancement auto + statut manuel), tous
// deux « En cours ». v13.225 n'en gardait qu'un, mais il n'indiquait plus
// clairement « Terminé ». v13.226 : une seule pastille = À faire (rien saisi) /
// En cours (saisie entamée) / Terminé (rendu) / Urgent. On vérifie qu'il n'y a
// qu'UNE pastille et qu'elle dit bien l'état. L'agent peut aussi encaisser même
// si un caissier existe (peutEncaisser élargi), sans tenir la caisse complète.
const { serve, openApp, createReporter } = require('./helpers');

const p = n => String(n).padStart(2, '0');
const now = new Date();
const AUJ = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());

const mk = (id, nom, resultats, statut) => ({
  id, type: 'Dossier', montant: 3000, created_at: AUJ + 'T09:00:00Z', created_by: 'agent1',
  patient: { nom, dossier: 'S' + id, date: AUJ, statut },
  resultats, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});
const FICHES = [
  mk(601, 'A FAIRE',  { _facture_seule: true },        'attente'), // rien saisi  → À faire
  mk(602, 'EN COURS', { 'Hématologie': { x: 1 } },     'attente'), // des résultats → En cours
  mk(603, 'TERMINE',  { 'Hématologie': { x: 1 } },     'rendu'),   // rendu        → Terminé
];

(async () => {
  const srv = await serve(8266);
  const r = createReporter('STATUT — PASTILLE UNIQUE (AVANCEMENT)');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'agent1', userId: 2, port: 8266,
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [],
           caissier_exists: true } });

  const cells = await page.evaluate(async () => {
    window._noCaissier = false;          // un caissier existe
    await refreshDB(true);
    if (typeof setHistPeriode === 'function') setHistPeriode('tout');
    renderHistory();
    const out = {};
    document.querySelectorAll('#history-body tr').forEach(tr => {
      const nom = (tr.querySelector('td[data-label="Patient"]') || {}).textContent || '';
      const td = tr.querySelector('td[data-label="Statut"]');
      const key = nom.includes('A FAIRE') ? 'afaire' : nom.includes('EN COURS') ? 'encours'
                : nom.includes('TERMINE') ? 'termine' : 'autre';
      // html = structure (compte des pastilles) ; text = libellé VISIBLE (hors
      // infobulle title, qui contient les mots du menu « À faire / Terminé … »).
      if (td) out[key] = { html: td.innerHTML, text: td.textContent };
    });
    return out;
  });

  r.section('Une seule pastille, pas de doublon');
  ['afaire', 'encours', 'termine'].forEach(k => {
    const h = (cells[k] || {}).html || '';
    r.check(k + ' : badge auto retiré', /Avancement de la saisie/.test(h), false);
    r.check(k + ' : une seule pastille cliquable', (h.match(/cycleStatut\(/g) || []).length, 1);
  });

  r.section('La pastille dit l\'avancement (libellé visible)');
  r.check('rien saisi → « À faire »',  /À faire/.test((cells.afaire || {}).text || ''), true);
  r.check('résultats → « En cours »',  /En cours/.test((cells.encours || {}).text || ''), true);
  r.check('rendu → « Terminé »',       /Terminé/.test((cells.termine || {}).text || ''), true);
  r.check('« Terminé » absent quand pas rendu', /Terminé/.test((cells.encours || {}).text || ''), false);
  r.check('« En cours » n\'est pas « Terminé »', /À faire/.test((cells.termine || {}).text || ''), false);

  r.section('L\'agent peut encaisser (caissier présent) sans tenir la caisse');
  r.check('peutEncaisser = true', await page.evaluate(() => peutEncaisser()), true);
  r.check('tientLaCaisse = false', await page.evaluate(() => tientLaCaisse()), false);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 4));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

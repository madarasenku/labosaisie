// ✅ v13.225 — UNE SEULE pastille de statut par ligne.
//
// Avant : chaque ligne d'historique affichait DEUX badges — l'avancement
// automatique (⚪/🟡 « En cours »/🟢) ET le statut manuel (🔵 « En cours »/✅/🔴).
// Deux « En cours » côte à côte. On garde le seul manuel (cliquable, qui pilote
// filtres/compteurs/actions et passe « Rendu » tout seul). On vérifie aussi que
// l'agent peut encaisser même si un caissier existe (peutEncaisser élargi).
const { serve, openApp, createReporter } = require('./helpers');

const p = n => String(n).padStart(2, '0');
const now = new Date();
const AUJ = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());

const FICHES = [
  { id: 501, type: 'Dossier', montant: 3000, created_at: AUJ + 'T09:00:00Z', created_by: 'agent1',
    patient: { nom: 'TEST STATUT', dossier: 'S1', date: AUJ },
    resultats: { 'Hématologie': { x: 1 } }, // a des résultats → l'auto aurait dit « En cours »
    prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
];

(async () => {
  const srv = await serve(8266);
  const r = createReporter('STATUT — PASTILLE UNIQUE + ENCAISSEMENT AGENT');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'agent1', userId: 2, port: 8266,
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [],
           caissier_exists: true } });

  const cell = await page.evaluate(async () => {
    window._noCaissier = false;          // un caissier existe
    await refreshDB(true);
    setHistPeriode && setHistPeriode('tout');
    renderHistory();
    const tr = document.querySelector('#history-body tr');
    const td = tr && tr.querySelector('td[data-label="Statut"]');
    return td ? td.innerHTML : '';
  });

  r.section('Une seule pastille de statut');
  r.check('badge d\'avancement auto retiré', /Avancement de la saisie/.test(cell), false);
  r.check('une seule pastille cliquable (cycleStatut)', (cell.match(/cycleStatut\(/g) || []).length, 1);
  r.check('la pastille dit « En cours »', /En cours/.test(cell), true);
  r.check('pas deux « En cours »', (cell.match(/En cours/g) || []).length, 1);

  r.section('L\'agent peut encaisser même avec un caissier');
  const peut = await page.evaluate(() => peutEncaisser());
  r.check('peutEncaisser = true', peut, true);
  const tient = await page.evaluate(() => tientLaCaisse());
  r.check('mais ne tient pas la caisse complète', tient, false);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 4));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

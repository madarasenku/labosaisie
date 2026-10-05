// Réduction de prix (prix verrouillés) + bilan mensuel admin.
//
// - Les cases prix (px_*) sont en lecture seule.
// - La case « Réduction » (montant OU %) calcule le NET (total − remise).
// - La remise + son auteur sont inscrits sur le patient ; le montant du dossier
//   devient le net.
// - Le tableau de bord admin agrège par auteur les réductions du mois.
const { serve, openApp, createReporter } = require('./helpers');

const p = n => String(n).padStart(2, '0');
const now = new Date();
const AUJ = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
const MOIS = AUJ.slice(0, 7);

const fiche = (id, nom, remise_montant, remise_par, demandeur) => ({
  id, type: 'Dossier', montant: 10000 - remise_montant, created_at: AUJ + 'T09:00:00Z', created_by: remise_par,
  patient: { nom, dossier: 'D' + id, date: AUJ, statut: 'rendu',
             remise_type: 'montant', remise_valeur: remise_montant, remise_montant,
             remise_par, remise_demandee_par: demandeur || '', remise_le: AUJ },
  resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});
// Attribution au DEMANDEUR si présent, sinon à l'agent :
//   nadia : 1000 + 3000 = 4000 (pas de demandeur) ; YERIGUE : 2000 ;
//   DR KONE (demandeur, saisi par YERIGUE) : 1500.
const FICHES = [
  fiche(1, 'A', 1000, 'nadia'),
  fiche(2, 'B', 3000, 'nadia'),
  fiche(3, 'C', 2000, 'YERIGUE'),
  fiche(5, 'E', 1500, 'YERIGUE', 'DR KONE'),
  { id: 4, type: 'Dossier', montant: 5000, created_at: AUJ + 'T10:00:00Z', created_by: 'nadia',
    patient: { nom: 'D', dossier: 'D4', date: AUJ }, resultats: {}, prescripteur_id: 1,
    est_bpn: false, restricted_by: null, deleted_at: null },
];

(async () => {
  const srv = await serve(8184);
  const r = createReporter('RÉDUCTION DE PRIX');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8184,
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [] } });

  // ── Prix verrouillés + calcul du net (UI) ───────────────────────────
  const ui = await page.evaluate(() => {
    if (typeof rechargeFichePrix === 'function') rechargeFichePrix();
    const nfs = document.getElementById('ex_nfs'); nfs.checked = true;
    if (typeof syncExamRowState === 'function') syncExamRowState('ex_nfs');
    calcFicheTotal();
    const pxRO = document.getElementById('px_ex_nfs')?.readOnly === true;
    const brut = Number(document.getElementById('montant-preview').dataset.montant);
    // Réduction montant 1000
    document.getElementById('remise-type').value = 'montant';
    document.getElementById('remise-valeur').value = '1000';
    calcFicheTotal();
    const netMontant = Number(document.getElementById('net-preview').dataset.net);
    // Réduction 10 %
    document.getElementById('remise-type').value = 'pct';
    document.getElementById('remise-valeur').value = '10';
    calcFicheTotal();
    const netPct = Number(document.getElementById('net-preview').dataset.net);
    // Marquage patient (avec un demandeur distinct de l'agent)
    document.getElementById('remise-demandeur').value = 'DR KONE';
    const pat = {};
    const remMontant = _appliquerRemisePatient(pat, brut);
    return { pxRO, brut, netMontant, netPct, remMontant, pat };
  });
  r.section('Prix verrouillés & calcul du net');
  r.check('case prix en lecture seule', ui.pxRO, true);
  r.check('réduction montant : net = brut − 1000', ui.netMontant, ui.brut - 1000);
  r.check('réduction 10 % : net = brut × 0,9', ui.netPct, Math.round(ui.brut * 0.9));
  r.check('remise inscrite sur le patient', ui.pat.remise_montant, ui.remMontant);
  r.check('agent (saisie) enregistré', ui.pat.remise_par, 'admin');
  r.check('demandeur (nom libre) enregistré', ui.pat.remise_demandee_par, 'DR KONE');

  // ── Bilan mensuel admin ─────────────────────────────────────────────
  const rapport = await page.evaluate(async (mois) => {
    await refreshDB(true);
    const sel = document.getElementById('reductions-mois'); if (sel) sel.value = mois;
    renderReductionsMois();
    const card = document.getElementById('reductions-card');
    return { visible: card && card.style.display !== 'none',
             texte: document.getElementById('reductions-mois-body').textContent };
  }, MOIS);
  r.section('Bilan mensuel (admin)');
  r.check('carte visible pour l\'admin', rapport.visible, true);
  r.check('nadia listée', /nadia/.test(rapport.texte), true);
  r.check('total nadia = 4 000', /4\s?000/.test(rapport.texte), true);
  r.check('YERIGUE listée', /YERIGUE/.test(rapport.texte), true);
  r.check('DR KONE (demandeur) listé, pas l\'agent', /DR KONE/.test(rapport.texte), true);
  r.check('total général = 7 500', /7\s?500/.test(rapport.texte), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

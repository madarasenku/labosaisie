// Encaissement d'un dossier GRATUIT (0 FCFA, ex. réduction 100 %).
//
// Bug : la modale de paiement laissait le bouton « Valider » DÉSACTIVÉ quand le
// montant était 0 (calcMonnaie traitait reçu = 0 comme invalide). Un patient
// gratuit restait donc coincé en « non encaissé ». On vérifie :
//  - réduction 100 % → net 0 ;
//  - la modale d'encaissement d'un dossier à 0 active le bouton Valider ;
//  - valider marque le dossier « payé ».
const { serve, openApp, createReporter } = require('./helpers');

const p = n => String(n).padStart(2, '0');
const now = new Date();
const AUJ = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());

const FICHES = [
  { id: 70, type: 'Dossier', montant: 0, created_at: AUJ + 'T09:00:00Z', created_by: 'nadia',
    patient: { nom: 'GRATUIT', dossier: 'G1', date: AUJ,
               remise_type: 'remise_pct', remise_valeur: 100, remise_montant: -3000,
               remise_par: 'nadia', remise_demandee_par: 'CHEF', remise_le: AUJ },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
];

(async () => {
  const srv = await serve(8186);
  const r = createReporter('ENCAISSEMENT GRATUIT (0 FCFA)');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8186,
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [] } });

  // Réduction 100 % → net 0 (côté saisie)
  const net100 = await page.evaluate(() => {
    if (typeof rechargeFichePrix === 'function') rechargeFichePrix();
    const nfs = document.getElementById('ex_nfs'); nfs.checked = true;
    if (typeof syncExamRowState === 'function') syncExamRowState('ex_nfs');
    document.getElementById('remise-type').value = 'remise_pct';
    document.getElementById('remise-valeur').value = '100';
    calcFicheTotal();
    return Number(document.getElementById('net-preview').dataset.net);
  });
  r.section('Réduction 100 %');
  r.check('net = 0', net100, 0);

  // Encaissement d'un dossier à 0 FCFA
  const enc = await page.evaluate(async () => {
    await refreshDB(true);
    ouvrirModalPaiement(70, 0);
    const btn = document.getElementById('pm-btn-valider');
    const avant = btn ? btn.disabled : null;       // doit être ACTIF (false)
    validerPaiement(70);
    return { boutonDesactive: avant, statut: getPaiementStatus(70) };
  });
  r.section('Dossier à 0 FCFA encaissable');
  r.check('bouton Valider actif (pas désactivé)', enc.boutonDesactive, false);
  r.check('dossier marqué payé', enc.statut, 'paye');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

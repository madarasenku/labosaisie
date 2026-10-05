// Ajustement de prix (prix verrouillés) : réduction (−) OU supplément (+),
// tracé (agent + demandeur) + bilan mensuel admin.
//
// - Les cases prix (px_*) sont en lecture seule.
// - Un seul contrôle « Ajustement » : Réduction/Supplément × Montant/%.
//   Net = total + ajustement signé (borné ≥ 0).
// - remise_montant est SIGNÉ : <0 réduction, >0 supplément. L'auteur agent et
//   le demandeur (nom libre) sont enregistrés ; le bilan admin regroupe par
//   demandeur (à défaut l'agent) et sépare réductions et suppléments.
const { serve, openApp, createReporter } = require('./helpers');

const p = n => String(n).padStart(2, '0');
const now = new Date();
const AUJ = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
const MOIS = AUJ.slice(0, 7);

// adj signé : négatif = réduction, positif = supplément.
const fiche = (id, nom, adj, par, demandeur) => ({
  id, type: 'Dossier', montant: 10000 + adj, created_at: AUJ + 'T09:00:00Z', created_by: par,
  patient: { nom, dossier: 'D' + id, date: AUJ, statut: 'rendu',
             remise_type: adj < 0 ? 'remise_montant' : 'supp_montant',
             remise_valeur: Math.abs(adj), remise_montant: adj,
             remise_par: par, remise_demandee_par: demandeur || '', remise_le: AUJ },
  resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});
// nadia : réductions 1000 + 3000 = 4000 ; YERIGUE : réduction 2000 ;
// DR KONE (demandeur, saisi par YERIGUE) : supplément 1500.
const FICHES = [
  fiche(1, 'A', -1000, 'nadia'),
  fiche(2, 'B', -3000, 'nadia'),
  fiche(3, 'C', -2000, 'YERIGUE'),
  fiche(5, 'E', +1500, 'YERIGUE', 'DR KONE'),
];

(async () => {
  const srv = await serve(8184);
  const r = createReporter('AJUSTEMENT (RÉDUCTION / SUPPLÉMENT)');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8184,
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [] } });

  const setAjust = (mode, valeur, dem) => page.evaluate(({ mode, valeur, dem }) => {
    document.getElementById('remise-type').value = mode;
    document.getElementById('remise-valeur').value = String(valeur);
    if (dem != null) document.getElementById('remise-demandeur').value = dem;
    calcFicheTotal();
    const net = Number(document.getElementById('net-preview').dataset.net);
    const pat = {}; const adj = _appliquerRemisePatient(pat, Number(document.getElementById('montant-preview').dataset.montant));
    return { net, adj, pat };
  }, { mode, valeur, dem });

  // ── Prix verrouillés + brut ─────────────────────────────────────────
  const brut = await page.evaluate(() => {
    if (typeof rechargeFichePrix === 'function') rechargeFichePrix();
    const nfs = document.getElementById('ex_nfs'); nfs.checked = true;
    if (typeof syncExamRowState === 'function') syncExamRowState('ex_nfs');
    calcFicheTotal();
    return { px: document.getElementById('px_ex_nfs')?.readOnly === true,
             total: Number(document.getElementById('montant-preview').dataset.montant) };
  });
  r.section('Prix verrouillés');
  r.check('case prix en lecture seule', brut.px, true);

  r.section('Réduction (−)');
  const redM = await setAjust('remise_montant', 1000, 'DR KONE');
  r.check('réduction montant : net = brut − 1000', redM.net, brut.total - 1000);
  r.check('ajustement signé négatif', redM.adj, -1000);
  r.check('remise_montant stocké négatif', redM.pat.remise_montant, -1000);
  r.check('demandeur enregistré', redM.pat.remise_demandee_par, 'DR KONE');
  r.check('agent enregistré', redM.pat.remise_par, 'admin');
  const redP = await setAjust('remise_pct', 10, '');
  r.check('réduction 10 % : net = brut × 0,9', redP.net, Math.round(brut.total * 0.9));

  r.section('Supplément (+)');
  const supM = await setAjust('supp_montant', 500, '');
  r.check('supplément montant : net = brut + 500', supM.net, brut.total + 500);
  r.check('ajustement signé positif', supM.adj, 500);
  r.check('remise_montant stocké positif', supM.pat.remise_montant, 500);

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
  r.check('nadia (réductions 4 000)', /nadia[\s\S]*4\s?000/.test(rapport.texte), true);
  r.check('YERIGUE listée', /YERIGUE/.test(rapport.texte), true);
  r.check('DR KONE (supplément) listé', /DR KONE/.test(rapport.texte), true);
  r.check('supplément 1 500 présent', /1\s?500/.test(rapport.texte), true);
  r.check('total réductions 6 000', /6\s?000/.test(rapport.texte), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

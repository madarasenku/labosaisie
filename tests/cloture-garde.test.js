//
// ════════════════════════════════════════════════════════════════════
//  cloture-garde — la clôture de caisse suit la GARDE.
//
//  Journée de service = permanence (8h00 → 16h30) + garde (16h30 → 8h00 le
//  lendemain). Un dossier encaissé à 02h00 le 13 est dans la clôture du 12.
//  Le gel d'une journée suit la même règle, et une journée ne peut être
//  verrouillée qu'une fois sa garde terminée.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const CIBLE = process.env.CIBLE || '/index.html';
const p = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
const base = new Date(); base.setHours(12, 0, 0, 0);
const jourDec = n => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const D = ymd(jourDec(0)), D1 = ymd(jourDec(1)), DM1 = ymd(jourDec(-1));

const pay = m => ({ montant_demande: m, montant_recu: m, monnaie: 0, monnaie_rendue: 0, monnaie_remise: true, agent: 'nadia' });
// Dossier PAYÉ, enregistré le jour calendaire `n` à h:m locale.
const fiche = (id, n, h, m, montant) => {
  const d = jourDec(n); d.setHours(h, m, 0, 0);
  return {
    id, type: 'Hématologie', montant, created_at: d.toISOString(), created_by: 'nadia',
    patient: { nom: 'P' + p(id), dossier: 'D' + p(id), date: ymd(d), statut: 'rendu',
               paiement_status: 'paye', paiement_infos: pay(montant) },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
  };
};
// Journée de service D :
//   permanence : 1 (09h, 1 000) + 2 (16h29, 2 000)                  = 3 000
//   garde      : 3 (16h30, 4 000) + 4 (23h30, 8 000) + 5 (D+1 02h00, 16 000)
//                + 6 (D+1 07h59, 32 000)                            = 60 000
// Hors journée D : 7 (D+1 08h00, 64 000 → perm. D+1) et 9 (D 03h00, 128 000 → garde D-1)
const FICHES = [
  fiche(1, 0, 9, 0, 1000), fiche(2, 0, 16, 29, 2000),
  fiche(3, 0, 16, 30, 4000), fiche(4, 0, 23, 30, 8000),
  fiche(5, 1, 2, 0, 16000), fiche(6, 1, 7, 59, 32000),
  fiche(7, 1, 8, 0, 64000), fiche(9, 0, 3, 0, 128000),
];

(async () => {
  const srv = await serve();
  const r = createReporter('CLÔTURE DE CAISSE — SUIT LA GARDE');
  const { ctx, page, errors } = await openApp({
    role: 'admin', cible: CIBLE,
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [] },
  });
  await page.waitForTimeout(1500);

  // ── Sommes par journée de service ───────────────────────────────────
  r.section('Recette d\'une journée de service = permanence + garde (jusqu\'à 8h le lendemain)');
  const cD = await page.evaluate(j => { const c = calculerCloture(j); return { total: c.total, n: c.dossiers, pp: c.parPoste }; }, D);
  r.check('total de la journée D (3 000 + 60 000)', cD.total, 63000);
  r.check('6 dossiers dans la clôture D', cD.n, 6);
  r.check('permanence : 3 000 (2 dossiers)', cD.pp.Permanence.total + '/' + cD.pp.Permanence.nb, '3000/2');
  r.check('garde : 60 000 (4 dossiers, nuit comprise)', cD.pp.Garde.total + '/' + cD.pp.Garde.nb, '60000/4');
  r.check('permanence + garde = total (rien perdu)', cD.pp.Permanence.total + cD.pp.Garde.total, cD.total);

  const cD1 = await page.evaluate(j => calculerCloture(j).total, D1);
  r.check('journée D+1 : seulement la permanence de 08h00 (64 000)', cD1, 64000);
  const cDM1 = await page.evaluate(j => calculerCloture(j).total, DM1);
  r.check('journée D-1 : la garde dont 03h00 du lendemain (128 000)', cDM1, 128000);
  r.check('chaque dossier compté une seule fois (somme des 3 jours)', cDM1 + cD.total + cD1, 128000 + 63000 + 64000);

  // ── Gel : suit la journée de service ────────────────────────────────
  r.section('Gel : un dossier de nuit suit la journée où la garde a commencé');
  const gel = await page.evaluate(([j]) => {
    _cloturesVerr = new Set([j]);                       // journée D verrouillée
    const f = id => _dbCache.find(x => x.id === id);
    return {
      perm: _jourDossierVerrouille(f(1)),               // 09h00 D
      garde: _jourDossierVerrouille(f(3)),              // 16h30 D
      nuit: _jourDossierVerrouille(f(5)),               // 02h00 D+1 → garde D
      matin: _jourDossierVerrouille(f(7)),              // 08h00 D+1 → perm D+1
      veille: _jourDossierVerrouille(f(9)),             // 03h00 D → garde D-1
    };
  }, [D]);
  r.check('permanence D gelée', gel.perm, true);
  r.check('garde D (16h30) gelée', gel.garde, true);
  r.check('02h00 le lendemain gelé avec la garde D', gel.nuit, true);
  r.check('08h00 le lendemain NON gelé (permanence D+1)', gel.matin, false);
  r.check('03h00 du jour D NON gelé (garde D-1)', gel.veille, false);

  // ── Verrouiller une journée dont la garde n'est pas finie ───────────
  r.section('Garde en cours : verrouillage refusé');
  const refus = await page.evaluate(async j => {
    window.__t = []; window.toast = m => window.__t.push(String(m));
    window.showConfirmModal = async () => true;
    window.showLoading = () => {}; window.hideLoading = () => {};
    _cloturesVerr = new Set();
    window.tientLaCaisse = () => true;
    _sb.rpc = async (n) => ({ data: n === 'verrouiller_journee' ? 'journee_en_cours' : { erreur: 'journee_en_cours' }, error: null });
    document.getElementById('cloture-date').value = j;
    await verrouillerJournee();
    const a = window.__t.slice(); window.__t = [];
    await verrouillerJusqua();
    return { journee: a, jusqua: window.__t.slice(), verrouillee: jourVerrouille(j) };
  }, D);
  r.check('message « garde pas terminée » (journée)', refus.journee.some(m => /garde n.est pas terminée/.test(m)), true);
  r.check('message « garde pas terminée » (jusqu\'à)', refus.jusqua.some(m => /garde n.est pas terminée/.test(m)), true);
  r.check('la journée n\'est pas marquée verrouillée', refus.verrouillee, false);

  // ── Date par défaut = journée de service en cours ───────────────────
  r.section('Date par défaut : journée de service en cours');
  const maintenant = new Date();
  const attendu = (maintenant.getHours() * 60 + maintenant.getMinutes() < 8 * 60) ? DM1 : D;
  const defaut = await page.evaluate(() => _jourServiceCourant());
  r.check('avant 08h00 → la veille ; sinon aujourd\'hui', defaut, attendu);

  // ── Impression ──────────────────────────────────────────────────────
  r.section('Clôture imprimée : journée de service');
  const doc = await page.evaluate(j => {
    window.print = () => {};
    document.getElementById('cloture-date').value = j;
    imprimerCloture();
    return document.getElementById('print-render').innerText;
  }, D);
  r.check('titre « Journée du … »', /Journée du /.test(doc), true);
  r.check('rappel permanence + garde jusqu\'à 8h00', /garde 16h30 → 8h00/.test(doc), true);
  r.check('recette 63 000 imprimée', /63\s?000/.test(doc), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

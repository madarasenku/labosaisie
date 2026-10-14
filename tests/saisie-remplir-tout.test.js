// ✅ v13.112 — Remplir un dossier multi-analyses sur UNE SEULE PAGE.
//
// Bug corrigé : à l'ouverture d'une fiche à compléter, l'app forçait le choix
// d'une seule analyse et n'affichait qu'un onglet. Pour un dossier NFS+GE+CRP,
// éditer l'Hématologie cachait le champ CRP (rangé sous l'onglet
// Immuno-Sérologie) → « je ne vois pas le champ CRP ».
//
// Comportement actuel (« tout par la série ») : fillAllResults() ouvre la saisie
// en série centrée sur le dossier ; tous ses examens sont alignés sur sa ligne.
// Ce test vérifie le point qui coinçait : la CRP est remplissable en même temps
// que la NFS.
const { serve, openApp, createReporter } = require('./helpers');

const DOSSIER_ID = 999;
const RES_FULL = {
  _types: ['Hématologie', 'Immuno-Sérologie'],
  _examens_coches: {
    'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'],
    'Immuno-Sérologie': ['CRP — Protéine C-réactive'],
  },
  _examens_prix: {
    'Hématologie': { 'NFS — Numération Formule Sanguine': 3000, 'Goutte épaisse / TDR Paludisme': 0 },
    'Immuno-Sérologie': { 'CRP — Protéine C-réactive': 3500 },
  },
  _montants: { 'Hématologie': 3000, 'Immuno-Sérologie': 3500 },
  _facture_seule: true,
};

const LIGHT_ROW = {
  id: DOSSIER_ID, type: 'Dossier', montant: 6500,
  created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'BAH MARIETOU', age: 28, sexe: 'F', medecin: 'IDE BAMBA', service: 'Maternité', dossier: '0255-0826' },
  resultats: RES_FULL, created_by: 'admin1', prescripteur_id: 1,
  est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('SAISIE — COMPLÉTER UN DOSSIER (SÉRIE)');
  const srv = await serve(8106);
  let ctx;
  try {
    const app = await openApp({
      role: 'admin', port: 8106,
      rpc: {
        get_resultats_light: [LIGHT_ROW],
        get_resultat_full: { resultats: RES_FULL },
      },
    });
    ctx = app.ctx;
    const { page, errors } = app;

    // ✅ TOUT PAR LA SÉRIE — la page « un patient » n'existe plus : compléter un
    //   dossier ouvre la SÉRIE centrée sur lui, avec TOUS ses examens sur la même
    //   ligne (le bug d'origine : la CRP n'était pas visible avec la NFS).
    r.section('Compléter un dossier = la série, tous les examens sur une ligne');
    await page.evaluate((id) => window.fillAllResults(id), DOSSIER_ID);
    await page.waitForTimeout(900);

    const état = await page.evaluate((id) => {
      const vis = el => !!(el && el.offsetParent !== null);
      const champ = k => [...document.querySelectorAll('#grow_' + id + ' td[data-exam="' + k + '"] input, #grow_' + id + ' td[data-exam="' + k + '"] select')]
        .filter(e => !e.disabled && e.type !== 'hidden');
      return {
        serie: vis(document.getElementById('grille-serie')),
        focus: _grilleFocusId,
        ligne: !!document.getElementById('grow_' + id),
        pageUnPatient: document.body.classList.contains('fill-all-mode'),
        nfs: champ('nfs').length,
        ge: champ('ge').length,
        crp: champ('crp').length,
      };
    }, DOSSIER_ID);

    r.check('la série s\'ouvre',                     état.serie, true);
    r.check('centrée sur ce dossier',                 état.focus, DOSSIER_ID);
    r.check('la ligne du patient est là',             état.ligne, true);
    r.check('plus de page « un patient »',            état.pageUnPatient, false);
    r.check('cases NFS remplissables',                état.nfs > 0, true);
    r.check('case GE remplissable',                   état.ge > 0, true);
    r.check('case CRP remplissable (le bug)',         état.crp > 0, true);
    r.check('aucune erreur JS',                        errors.length, 0);

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
})();

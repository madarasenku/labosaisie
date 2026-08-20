// ✅ v13.112 — Remplir un dossier multi-analyses sur UNE SEULE PAGE.
//
// Bug corrigé : à l'ouverture d'une fiche à compléter, l'app forçait le choix
// d'une seule analyse et n'affichait qu'un onglet. Pour un dossier NFS+GE+CRP,
// éditer l'Hématologie cachait le champ CRP (rangé sous l'onglet
// Immuno-Sérologie) → « je ne vois pas le champ CRP ».
//
// Nouveau comportement : fillAllResults() empile TOUTES les analyses cochées
// sur une page (plusieurs panneaux visibles), masque la barre d'onglets, et
// un seul bouton enregistre le tout en routant chaque résultat vers sa bonne
// analyse. Ce test vérifie le point qui coinçait : le champ CRP est visible et
// remplissable en même temps que la NFS.
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
  const r = createReporter('SAISIE — REMPLIR TOUT SUR UNE PAGE');
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

    r.section('Ouverture en mode « remplir tout »');
    await page.evaluate((id) => window.fillAllResults(id), DOSSIER_ID);
    await page.waitForTimeout(700);

    const état = await page.evaluate(() => {
      const vis = el => !!(el && el.offsetParent !== null);
      const tabs = document.querySelector('.tabs');
      const secCrp = document.getElementById('sec-crp');
      // un champ remplissable dans la section CRP ?
      const champsCrp = secCrp
        ? [...secCrp.querySelectorAll('input, select, textarea')].filter(e => !e.disabled && e.type !== 'checkbox')
        : [];
      return {
        fillAllClass: document.body.classList.contains('fill-all-mode'),
        hemaActive: document.getElementById('panel-hema')?.classList.contains('active'),
        seroActive: document.getElementById('panel-sero')?.classList.contains('active'),
        tabsHidden: tabs ? getComputedStyle(tabs).display === 'none' : false,
        crpVisible: vis(secCrp),
        crpChecked: !!document.getElementById('ex_crp')?.checked,
        crpRemplissable: champsCrp.length > 0,
        nfsVisible: vis(document.getElementById('sec-nfs')),
      };
    });

    r.check('mode « remplir tout » actif',            état.fillAllClass, true);
    r.check('panneau Hématologie affiché',            état.hemaActive, true);
    r.check('panneau Immuno-Sérologie affiché aussi', état.seroActive, true);
    r.check('barre d\'onglets masquée',               état.tabsHidden, true);
    r.check('section NFS visible',                     état.nfsVisible, true);
    r.check('CRP encore coché (restauré)',            état.crpChecked, true);
    r.check('section CRP VISIBLE (le bug)',           état.crpVisible, true);
    r.check('champ CRP remplissable',                 état.crpRemplissable, true);
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

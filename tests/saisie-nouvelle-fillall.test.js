// ✅ v13.114 — NOUVELLE saisie « tout sur une page ».
//
// Demande utilisateur : « lorsque je fini d'enregistrer les informations du
// patient la page qui suit doit être composée QUE des examens cochés. Je ne
// veux même plus voir les examens non cochés verrouillés. Et les examens cochés
// sur une seule page que je remplis simplement sans changer d'onglets. »
//
// Ce test vérifie le parcours FRAIS (pas l'édition d'un dossier existant) :
//   1) on remplit la fiche patient et on coche NFS (héma) + CRP (séro) ;
//   2) demarrerSaisie() empile les DEUX panneaux, masque la barre d'onglets,
//      cache les panneaux sans examen coché, et n'affiche qu'un seul bouton ;
//   3) l'enregistrement crée UN SEUL dossier (un seul insert_resultat) portant
//      les deux analyses.
const { serve, openApp, createReporter, setField } = require('./helpers');

(async () => {
  const r = createReporter('SAISIE — NOUVELLE FICHE « TOUT SUR UNE PAGE »');
  const srv = await serve(8107);
  const appels = [];
  let ctx;
  try {
    const app = await openApp({
      role: 'admin', port: 8107, appels,
      rpc: {
        get_next_dossier_num: '0300-0826',
        insert_resultat: { id: 777, dossier: '0300-0826' },
      },
    });
    ctx = app.ctx;
    const { page, errors } = app;

    // Aller sur la vue Saisie / fiche d'identification
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(400);

    r.section('Fiche patient + examens cochés (NFS + CRP)');
    await setField(page, 'p_nom', 'TEST PATIENT');
    // Cocher NFS (héma) et CRP (séro) puis recalculer le montant.
    await page.evaluate(() => {
      ['ex_nfs', 'ex_crp'].forEach(id => {
        const cb = document.getElementById(id);
        if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      if (typeof calcFicheTotal === 'function') calcFicheTotal();
    });
    await page.waitForTimeout(200);

    r.section('demarrerSaisie() → vue empilée');
    await page.evaluate(() => window.demarrerSaisie());
    await page.waitForTimeout(700);

    const état = await page.evaluate(() => {
      const vis = el => !!(el && el.offsetParent !== null);
      const tabs = document.querySelector('.tabs');
      const btnAll = document.getElementById('btn-save-all');
      const secParasito = document.getElementById('sec-eps') || document.getElementById('panel-parasito');
      return {
        fillAllClass: document.body.classList.contains('fill-all-mode'),
        fillAllVar: (typeof _fillAllMode !== 'undefined') ? _fillAllMode : null,
        pasEnEdition: (typeof _editingRecordId === 'undefined') || _editingRecordId === null,
        hemaActive: document.getElementById('panel-hema')?.classList.contains('active'),
        seroActive: document.getElementById('panel-sero')?.classList.contains('active'),
        bioActive:  document.getElementById('panel-bio')?.classList.contains('active'),
        tabsHidden: tabs ? getComputedStyle(tabs).display === 'none' : false,
        nfsVisible: vis(document.getElementById('sec-nfs')),
        crpVisible: vis(document.getElementById('sec-crp')),
        btnAllVisible: vis(btnAll),
        // un panneau non coché (biochimie) ne doit pas être affiché
        bioVisible: vis(document.getElementById('panel-bio')),
      };
    });

    r.check('mode « tout sur une page » actif (classe)', état.fillAllClass, true);
    r.check('drapeau _fillAllMode = true',               état.fillAllVar, true);
    r.check('pas en mode édition (dossier neuf)',        état.pasEnEdition, true);
    r.check('panneau Hématologie affiché',               état.hemaActive, true);
    r.check('panneau Immuno-Sérologie affiché aussi',    état.seroActive, true);
    r.check('panneau Biochimie NON affiché',             état.bioActive, false);
    r.check('barre d\'onglets masquée',                  état.tabsHidden, true);
    r.check('section NFS visible',                        état.nfsVisible, true);
    r.check('section CRP visible',                        état.crpVisible, true);
    r.check('bouton unique « Enregistrer » visible',     état.btnAllVisible, true);

    r.section('Enregistrement atomique (un seul insert)');
    await page.evaluate(() => window.saveAllTabs());
    await page.waitForTimeout(800);

    const nbInsert = appels.filter(f => f === 'insert_resultat').length;
    const sortiFillAll = await page.evaluate(() => ({
      cls: document.body.classList.contains('fill-all-mode'),
      v: (typeof _fillAllMode !== 'undefined') ? _fillAllMode : null,
    }));

    r.check('un SEUL insert_resultat émis',              nbInsert, 1);
    r.check('sorti du mode « tout sur une page »',       sortiFillAll.cls, false);
    r.check('drapeau _fillAllMode remis à false',        sortiFillAll.v, false);
    r.check('aucune erreur JS',                          errors.length, 0);

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

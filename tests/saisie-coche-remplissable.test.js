// Saisissabilité des résultats — la règle est : COCHÉ ⇒ REMPLISSABLE.
//
// Dès qu'un examen est coché (donc facturé sur la fiche), ses champs de saisie
// sont immédiatement remplissables — sur chaque onglet, et QUEL QUE SOIT le
// statut de paiement du dossier. Un examen non coché a ses champs verrouillés
// (🔒) et vidés : on ne saisit ni ne facture un résultat qui n'a pas été
// demandé.
//
// Le paiement n'intervient plus au niveau des CHAMPS : il reste imposé au
// moment de l'ENREGISTREMENT (_saveRecordImpl renvoie à la caisse si le dossier
// n'est pas payé). On peut donc saisir un résultat, mais pas le figer tant que
// l'encaissement n'est pas fait — la sécurité est au bon endroit.
//
// Ce fichier vérifie les deux sens de la règle, onglet par onglet PUIS examen
// par examen, y compris sur un dossier NON payé (le point qui a changé).
const { serve, openApp, createReporter } = require('./helpers');

// Les six panneaux = les six onglets de la vue Saisie.
const PANNEAUX = {
  'Hématologie'      : '#panel-hema',
  'Biochimie'        : '#panel-bio',
  'Bactériologie'    : '#panel-bacterio',
  'Immuno-Sérologie' : '#panel-sero',
  'Parasitologie'    : '#panel-parasito',
  'Groupe sanguin'   : '#panel-gs',
};

// Compte, dans un panneau, les champs de saisie éditables (non verrouillés).
// visibleOnly=true : ne compte que ceux RÉELLEMENT saisissables par l'agent,
// c.-à-d. visibles à l'écran (une section masquée n'est pas remplissable même
// si ses <input> restent techniquement activés).
function editablesDansPanneau(page, selecteur, visibleOnly) {
  return page.evaluate(({ sel, visibleOnly }) => {
    const panel = document.querySelector(sel);
    if (!panel) return -1;
    const estVisible = el => !!(el.offsetParent !== null ||
      (el.getClientRects && el.getClientRects().length));
    let editables = 0;
    panel.querySelectorAll('input, select, textarea').forEach(el => {
      const t = (el.type || '').toLowerCase();
      if (['hidden','button','submit','reset'].includes(t)) return;
      if (el.disabled) return;
      if (visibleOnly && !estVisible(el)) return;
      editables++;
    });
    return editables;
  }, { sel: selecteur, visibleOnly: !!visibleOnly });
}

// Construit les six panneaux (rendu paresseux au 1er clic sinon), place
// l'application en édition de résultats d'un dossier au paiement donné, coche
// éventuellement un examen par onglet, puis applique les verrous.
function preparer(page, { paye, cocherUnParOnglet }) {
  return page.evaluate(({ paye, cocherUnParOnglet }) => {
    ['hema','bio','bacterio','sero','parasito','gs'].forEach(n => {
      try { ensurePanelBuilt(n); } catch (e) {} });
    const ID = 999999;
    localStorage.setItem('v2_labosaisie_paiements_v1',
      JSON.stringify({ [ID]: paye ? 'paye' : 'non_paye' }));
    _editingRecordId = ID;
    if (typeof _editingFicheId !== 'undefined') _editingFicheId = null;
    if (typeof _locksDisabled  !== 'undefined') _locksDisabled  = false;

    const cat = getCatalogueComplet();
    cat.forEach(ex => { const cb = document.getElementById(ex.id); if (cb) cb.checked = false; });
    const coches = [];
    if (cocherUnParOnglet) {
      const vus = {};
      cat.forEach(ex => {
        if (vus[ex.tab]) return;
        const cb = document.getElementById(ex.id);
        if (cb) { cb.checked = true; vus[ex.tab] = true; coches.push(ex.id); }
      });
    }
    if (typeof calcFicheTotal === 'function') calcFicheTotal();
    applyExamLocks();
    return coches;
  }, { paye, cocherUnParOnglet });
}

(async () => {
  const srv = await serve();
  const r = createReporter('SAISIE — COCHÉ ⇒ REMPLISSABLE');

  // ── 1. Coché ⇒ remplissable sur chaque onglet, MÊME dossier impayé ──
  {
    r.section('Un examen coché est remplissable sur son onglet (dossier NON payé)');
    const { ctx, page, errors } = await openApp({ role: 'admin',
      rpc: { get_tarifs: {}, get_examens_custom: [] } });

    const coches = await preparer(page, { paye: false, cocherUnParOnglet: true });
    r.check('un examen coché par onglet (mise en situation)', coches.length >= 5, true);

    for (const [nom, sel] of Object.entries(PANNEAUX)) {
      const nb = await editablesDansPanneau(page, sel);
      r.check('« ' + nom + ' » — des champs sont remplissables', nb > 0, true);
    }
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 2. Rien de coché ⇒ rien n'est réellement saisissable ─────────
  // On compte les champs VISIBLES et éditables : un agent ne peut taper que
  // dans ce qui est à l'écran. Sans examen coché, chaque section de résultats
  // est masquée → aucun champ saisissable, sur aucun onglet.
  {
    r.section('Sans examen coché, aucun champ n\'est réellement saisissable');
    const { ctx, page, errors } = await openApp({ role: 'admin',
      rpc: { get_tarifs: {}, get_examens_custom: [] } });

    await preparer(page, { paye: true, cocherUnParOnglet: false });
    for (const [nom, sel] of Object.entries(PANNEAUX)) {
      const nb = await editablesDansPanneau(page, sel, true /* visibleOnly */);
      r.check('« ' + nom + ' » — champs visibles saisissables', nb, 0);
    }
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 3. Examen par examen : coché ⇒ éditable, décoché ⇒ verrouillé ──
  {
    r.section('Chaque examen, un par un (dossier NON payé)');
    const { ctx, page, errors } = await openApp({ role: 'admin',
      rpc: { get_tarifs: {}, get_examens_custom: [] } });

    const bilan = await page.evaluate(() => {
      ['hema','bio','bacterio','sero','parasito','gs'].forEach(n => {
        try { ensurePanelBuilt(n); } catch (e) {} });
      const ID = 888888;
      // Dossier volontairement NON payé : cocher doit suffire à remplir.
      localStorage.setItem('v2_labosaisie_paiements_v1', JSON.stringify({ [ID]: 'non_paye' }));
      _editingRecordId = ID;
      if (typeof _editingFicheId !== 'undefined') _editingFicheId = null;
      if (typeof _locksDisabled  !== 'undefined') _locksDisabled  = false;

      const cat = getCatalogueComplet();
      const decocherTout = () => cat.forEach(ex => {
        const cb = document.getElementById(ex.id); if (cb) cb.checked = false; });

      const champsDe = ex => {
        let els = ((typeof examFieldIds === 'function') ? examFieldIds(ex.id) : [])
          .map(i => document.getElementById(i)).filter(Boolean);
        if (!els.length && ex.section) {
          const sec = document.getElementById(ex.section);
          if (sec) els = [...sec.querySelectorAll('input,select,textarea')]
            .filter(el => !['hidden','button','submit','reset'].includes((el.type||'').toLowerCase()));
        }
        return els;
      };

      const echecsCoche = [], echecsDecoche = [];
      let testables = 0;

      cat.forEach(ex => {
        const cb = document.getElementById(ex.id);
        if (!cb) return;
        // On récupère les champs pendant que l'examen est coché (sinon sa
        // section peut être masquée donc introuvable).
        decocherTout(); cb.checked = true; applyExamLocks();
        const els = champsDe(ex);
        if (!els.length) return;
        testables++;
        if (els.some(el => el.disabled)) echecsCoche.push(ex.id);   // coché ⇒ doit être éditable

        // Puis on le décoche : ses champs doivent se verrouiller.
        decocherTout(); applyExamLocks();
        if (els.some(el => !el.disabled)) echecsDecoche.push(ex.id); // décoché ⇒ doit être verrouillé
      });

      return { total: cat.length, testables, echecsCoche, echecsDecoche };
    });

    r.check('couverture large des examens (>= 60 vérifiés un par un)',
            bilan.testables >= 60 ? bilan.testables + ' / ' + bilan.total : 'trop peu : ' + bilan.testables,
            bilan.testables + ' / ' + bilan.total);
    r.check('coché (impayé) : aucun examen bloqué à tort',
            bilan.echecsCoche.length ? bilan.echecsCoche.join(', ') : 'aucun', 'aucun');
    r.check('décoché : aucun examen ne reste remplissable',
            bilan.echecsDecoche.length ? bilan.echecsDecoche.join(', ') : 'aucun', 'aucun');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

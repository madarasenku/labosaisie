// Verrou « paiement » de la saisie — onglet par onglet.
//
// Règle métier : on ne saisit un résultat qu'une fois le dossier ENCAISSÉ.
// Le paiement se décide au niveau du DOSSIER (isDossierPaye), donc la règle
// est binaire : dossier non payé ⇒ AUCUN champ de résultat n'est saisissable,
// sur AUCUN des six onglets ; dossier payé ⇒ les examens cochés redeviennent
// saisissables.
//
// Pourquoi ce test existe : le verrouillage s'appuyait sur une table tenue à
// la main (examFieldIds). Tout examen — surtout un examen personnalisé —
// absent de cette table restait remplissable sur un dossier impayé. Le filet
// de sécurité v13.97 verrouille désormais les panneaux EN BLOC quand le
// dossier n'est pas payé ; ce test le vérifie pour chacun des six onglets.
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

// Compte, dans un panneau, les champs de saisie ENCORE éditables (donc NON
// verrouillés). On ignore les boutons et les champs cachés : seuls comptent
// les vrais champs de saisie de résultat.
function editablesDansPanneau(page, selecteur) {
  return page.evaluate(sel => {
    const panel = document.querySelector(sel);
    if (!panel) return -1; // panneau introuvable → signalé comme anomalie
    const champs = panel.querySelectorAll('input, select, textarea');
    let editables = 0;
    champs.forEach(el => {
      const t = (el.type || '').toLowerCase();
      if (t === 'hidden' || t === 'button' || t === 'submit' || t === 'reset') return;
      if (!el.disabled) editables++;
    });
    return editables;
  }, selecteur);
}

// Met l'application en « édition des résultats du dossier p_id », coche un
// examen par onglet, fixe le statut de paiement, puis applique les verrous.
function preparerEdition(page, paye) {
  return page.evaluate(({ paye }) => {
    // Les panneaux sont construits paresseusement (au 1er clic sur l'onglet).
    // On force la construction des six, sinon on testerait des panneaux vides.
    ['hema','bio','bacterio','sero','parasito','gs'].forEach(n => {
      try { ensurePanelBuilt(n); } catch (e) {} });
    const ID = 999999; // un id qui n'existe pas dans le cache DB de test
    // Statut de paiement via localStorage (getPaiementStatus retombe dessus
    // quand l'id est absent du cache DB).
    const p = {}; p[ID] = paye ? 'paye' : 'non_paye';
    localStorage.setItem('v2_labosaisie_paiements_v1', JSON.stringify(p));

    // Se placer en édition de résultats (et pas en modification d'accueil).
    _editingRecordId = ID;
    if (typeof _editingFicheId !== 'undefined') _editingFicheId = null;
    if (typeof _locksDisabled  !== 'undefined') _locksDisabled  = false;

    // Cocher le PREMIER examen de chaque onglet : sur un dossier payé ces
    // champs doivent (re)devenir éditables ; sur un impayé, ils doivent rester
    // verrouillés malgré la coche.
    const cat = getCatalogueComplet();
    const vus = {};
    const coches = [];
    cat.forEach(ex => {
      if (vus[ex.tab]) return;
      const cb = document.getElementById(ex.id);
      if (cb) { cb.checked = true; vus[ex.tab] = true; coches.push(ex.id); }
    });
    if (typeof calcFicheTotal === 'function') calcFicheTotal();
    applyExamLocks();
    return coches;
  }, { paye });
}

(async () => {
  const srv = await serve();
  const r = createReporter('VERROU PAIEMENT — SAISIE PAR ONGLET');

  // ── 1. Dossier NON payé : rien n'est saisissable, sur aucun onglet ──
  {
    r.section('Dossier non payé : chaque onglet est entièrement verrouillé');
    const { ctx, page, errors } = await openApp({ role: 'admin',
      rpc: { get_tarifs: {}, get_examens_custom: [] } });

    const coches = await preparerEdition(page, false);
    r.check('au moins un examen coché par onglet (mise en situation)',
            coches.length >= 5, true);

    for (const [nom, sel] of Object.entries(PANNEAUX)) {
      const nb = await editablesDansPanneau(page, sel);
      r.check('« ' + nom + ' » — champs encore saisissables', nb, 0);
    }
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 2. Dossier payé : les examens cochés redeviennent saisissables ──
  {
    r.section('Dossier payé : les examens cochés sont de nouveau saisissables');
    const { ctx, page, errors } = await openApp({ role: 'admin',
      rpc: { get_tarifs: {}, get_examens_custom: [] } });

    await preparerEdition(page, true);

    // Au global, il doit rester des champs éditables (sinon le verrou est trop
    // agressif et casse la saisie d'un dossier pourtant payé).
    let totalEditables = 0;
    for (const sel of Object.values(PANNEAUX)) {
      const nb = await editablesDansPanneau(page, sel);
      if (nb > 0) totalEditables += nb;
    }
    r.check('des champs redeviennent saisissables une fois payé',
            totalEditables > 0, true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 3. Garantie EXAMEN PAR EXAMEN ────────────────────────────────
  // On ne se contente pas d'un examen par onglet : on parcourt CHAQUE examen
  // du catalogue qui possède des champs de saisie identifiés, et pour chacun,
  // isolément, on vérifie les deux sens de la règle.
  {
    r.section('Chaque examen, un par un : payé ⇒ saisissable, impayé ⇒ verrouillé');
    const { ctx, page, errors } = await openApp({ role: 'admin',
      rpc: { get_tarifs: {}, get_examens_custom: [] } });

    const bilan = await page.evaluate(() => {
      ['hema','bio','bacterio','sero','parasito','gs'].forEach(n => {
        try { ensurePanelBuilt(n); } catch (e) {} });
      const ID = 888888;
      const setPaye = paye => localStorage.setItem(
        'v2_labosaisie_paiements_v1', JSON.stringify({ [ID]: paye ? 'paye' : 'non_paye' }));
      _editingRecordId = ID;
      if (typeof _editingFicheId !== 'undefined') _editingFicheId = null;
      if (typeof _locksDisabled  !== 'undefined') _locksDisabled  = false;

      const cat = getCatalogueComplet();
      const decocherTout = () => cat.forEach(ex => {
        const cb = document.getElementById(ex.id); if (cb) cb.checked = false; });

      const champsDe = ex => {
        // Champs propres à l'examen (table examFieldIds) …
        let ids = (typeof examFieldIds === 'function') ? examFieldIds(ex.id) : [];
        // … ou, pour les examens gérés en bloc (bactério), tout le panneau.
        let els = ids.map(i => document.getElementById(i)).filter(Boolean);
        if (!els.length && ex.section) {
          const sec = document.getElementById(ex.section);
          if (sec) els = [...sec.querySelectorAll('input,select,textarea')]
            .filter(el => !['hidden','button','submit','reset'].includes((el.type||'').toLowerCase()));
        }
        return els;
      };

      const echecsPaye = [], echecsImpaye = [];
      let testables = 0;

      cat.forEach(ex => {
        decocherTout();
        const cb = document.getElementById(ex.id);
        if (!cb) return;                       // examen sans case (rien à tester)
        cb.checked = true;
        const els = champsDe(ex);
        if (!els.length) return;               // examen sans champ de saisie (ex. personnalisé)
        testables++;

        // Payé : les champs de CET examen doivent être saisissables.
        setPaye(true);  applyExamLocks();
        if (els.some(el => el.disabled)) echecsPaye.push(ex.id);

        // Impayé : les champs de CET examen doivent être verrouillés.
        setPaye(false); applyExamLocks();
        if (els.some(el => !el.disabled)) echecsImpaye.push(ex.id);
      });

      return { total: cat.length, testables, echecsPaye, echecsImpaye };
    });

    // Garde-fou anti « faux positif silencieux » : on exige une couverture
    // réelle et large (la majorité des 84 examens du catalogue), pas 2-3.
    r.check('couverture large des examens (>= 60 vérifiés un par un)',
            bilan.testables + ' / ' + bilan.total, (n => n >= 60 ? n + ' / ' + bilan.total : 'trop peu')(bilan.testables));
    r.check('impayé : aucun examen ne reste saisissable',
            bilan.echecsImpaye.length ? bilan.echecsImpaye.join(', ') : 'aucun', 'aucun');
    r.check('payé : aucun examen ne reste bloqué à tort',
            bilan.echecsPaye.length ? bilan.echecsPaye.join(', ') : 'aucun', 'aucun');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

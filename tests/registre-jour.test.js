// Registre du jour (v13.169) — synthèse des résultats et liste d'examens.
//
// On vérifie les fonctions PURES de js/registre-jour.js dans le contexte de
// la page : la synthèse doit donner la VALEUR SEULE (impression noir & blanc,
// donc aucune interprétation couleur ni flèche), la CRP négative doit devenir
// « <6 mg/L », et un forfait prénatal doit être regroupé sous un seul libellé.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('REGISTRE DU JOUR');
  const srv = await serve();
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  // Les fonctions et l'UI sont-elles bien chargées ?
  const dispo = await page.evaluate(() => ({
    synthese: typeof _regSynthese === 'function',
    examens: typeof _regExamens === 'function',
    render: typeof renderRegistre === 'function',
    imprime: typeof imprimerRegistre === 'function',
    carte: !!document.getElementById('registre-card'),
    champDate: !!document.getElementById('registre-date'),
  }));
  r.check('_regSynthese défini', dispo.synthese, true);
  r.check('_regExamens défini', dispo.examens, true);
  r.check('renderRegistre défini', dispo.render, true);
  r.check('imprimerRegistre défini', dispo.imprime, true);
  r.check('carte « Registre du jour » présente', dispo.carte, true);
  r.check('champ date présent', dispo.champDate, true);

  // Cas NFS + GE + CRP négative.
  const cas1 = await page.evaluate(() => {
    const res = {
      '_examens_coches': {
        'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'],
        'Immuno-Sérologie': ['CRP — Protéine C-réactive'],
      },
      'Hématologie': {
        'GE - Résultat': 'Négatif',
        'Globules blancs (GB)': { valeur: '6.92', interp: 'Normal' },
        'Globules rouges (GR)': { valeur: '4.62', interp: 'Normal' },
        'Hémoglobine (Hb)': { valeur: '10.9', interp: 'Bas' },
        'Hématocrite (Ht)': { valeur: '35.1', interp: 'Bas' },
        'Polynucléaires neutrophiles (PNN)': { pct: '75', interp: 'Normal' },
        'Monocytes': { pct: '03', interp: 'Normal' },
        'Lymphocytes': { pct: '20', interp: 'Normal' },
      },
      'Immuno-Sérologie': { 'CRP - Valeur': 'neg' },
    };
    return { synthese: _regSynthese(res), examens: _regExamens(res) };
  });
  r.check('synthèse NFS+GE+CRP (valeurs seules)', cas1.synthese,
    'GE négatif · GB 6.92 · GR 4.62 · Hb 10.9 · Ht 35.1 · PNN 75% · Mono 3% · Lympho 20% · CRP < 6 mg/L');
  r.check('aucune interprétation couleur (flag)', /flag/.test(cas1.synthese), false);
  r.check('aucune flèche ↑/↓', /[↑↓]/.test(cas1.synthese), false);
  r.check('Mono « 03 » normalisé en « 3 »', /Mono 3%/.test(cas1.synthese), true);
  r.check('examens abrégés', cas1.examens, 'NFS · GE/TDR · CRP');

  // Cas CRP positive + GE positif + biochimie + groupe.
  const cas2 = await page.evaluate(() => {
    const res = {
      '_examens_coches': { 'Biochimie': ['Glycémie à jeun', 'Urée', 'Créatinine'], 'Groupe sanguin': ['Groupe sanguin ABO / Rhésus'], 'Hématologie': ['Goutte épaisse / TDR Paludisme'] },
      'Hématologie': { 'GE - Résultat': 'Positif' },
      'Immuno-Sérologie': { 'CRP - Valeur': '96' },
      'Biochimie': {
        'Glycémie à jeun': { valeur: '0.97', interp: 'Élevé' },
        'Créatinine': { valeur: '8.7', interp: 'Normal' },
        'Urée': { valeur: '0.20', interp: 'Normal' },
      },
      'Groupe sanguin': { 'Groupe ABO': 'O', 'Rhésus': 'Positif' },
    };
    return _regSynthese(res);
  });
  r.check('CRP positive en valeur directe', /CRP 96 mg\/L/.test(cas2), true);
  r.check('GE positif', /GE positif/.test(cas2), true);
  r.check('Groupe O Rhésus+', /Gpe O\+/.test(cas2), true);
  r.check('Glycémie avec unité', /Gly 0\.97 g\/L/.test(cas2), true);

  // Forfait prénatal regroupé.
  const exBpn = await page.evaluate(() => _regExamens({
    '_examens_coches': {
      'Hématologie': ['NFS — Numération Formule Sanguine', 'Bilan prénatal complet (forfait)'],
      'Immuno-Sérologie': ['Ag HBs (Hépatite B)'],
    },
  }));
  r.check('forfait prénatal regroupé', exBpn, 'Bilan prénatal (forfait)');

  // Dossier sans résultats → synthèse vide (statut « en attente »).
  const vide = await page.evaluate(() => _regSynthese({ '_examens_coches': { 'Hématologie': ['NFS — Numération Formule Sanguine'] } }));
  r.check('aucun résultat → synthèse vide', vide, '');

  r.check('aucune erreur page', errors.join(' | ') || 'aucune', 'aucune');

  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

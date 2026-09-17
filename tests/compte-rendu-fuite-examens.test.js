// Le compte rendu n'imprime QUE les examens réellement commandés.
//
// Bugs réels reproduits (base de production, sept. 2026) :
//  • un dossier ne commandant que glycémie/urée/créat/ionogramme/Ca/Mg sortait
//    avec HDL / Triglycérides / LDL (valeurs contaminées d'un patient précédent) ;
//  • des bilans prénatals sortaient avec « GE - Résultat : Négatif » alors que la
//    goutte épaisse ne faisait pas partie du forfait.
// Le rendu se fondant sur ce qui est STOCKÉ, il imprimait ces résultats fantômes.
// On vérifie qu'ils n'apparaissent plus, sans amputer les examens légitimes.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('COMPTE RENDU — PAS D\'EXAMEN NON COMMANDÉ');
  const srv = await serve(8175);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8175 });
    ctx = app.ctx; const { page, errors } = app;

    const res = await page.evaluate(async () => {
      // 1) Dossier « patient du 15 » : lipides NON commandés mais valeurs présentes.
      const recLipides = { id: 1, type: 'Dossier', montant: 12000,
        patient: { nom: 'FUITE LIPIDES', dossier: '0227-0926', sexe: 'F', age: 32, date: '2026-09-15' },
        resultats: {
          _types: ['Biochimie'],
          _examens_coches: { 'Biochimie': ['Glycémie à jeun', 'Urée', 'Créatinine',
            'Ionogramme (Na, K, Cl)', 'Calcium', 'Magnésium'] },
          'Biochimie': {
            'Glycémie à jeun': { valeur: '0.92', unite: 'g/L', interp: '' },
            'Sodium (Na⁺)': { valeur: '140', unite: 'mmol/L', interp: '' },
            // Contamination : lipides jamais commandés
            'HDL-cholestérol': { valeur: '0.16', unite: 'g/L', interp: 'Bas' },
            'Triglycérides': { valeur: '2.89', unite: 'g/L', interp: 'Élevé' },
            'LDL-cholestérol ⚙': { valeur: '0.04', unite: 'g/L', interp: '' },
          } } };

      // 2) Bilan prénatal avec GE « Négatif » contaminée (GE non commandée).
      const recBpnGe = { id: 2, type: 'Dossier', montant: 20000, est_bpn: true,
        patient: { nom: 'FUITE GE BPN', dossier: '0128-0926', sexe: 'F', age: 28, date: '2026-09-09' },
        resultats: {
          _types: ['Hématologie'],
          _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine',
            "Électrophorèse de l'hémoglobine", 'Bilan prénatal complet (forfait)'] },
          'Hématologie': {
            'Globules blancs (GB)': { valeur: '6.9', unite: '10³/µL', interp: '' },
            'GE - Résultat': 'Négatif',   // contamination
          } } };

      const t1 = await crBuildHTML(recLipides);
      const t2 = await crBuildHTML(recBpnGe);
      return {
        lip_hdl: /HDL/.test(t1),
        lip_tg: /Triglyc/.test(t1),
        lip_ldl: /LDL/.test(t1),
        lip_gly: /Glyc[eé]mie/.test(t1),   // légitime → doit rester
        lip_na: /Sodium/.test(t1),         // légitime → doit rester
        bpn_ge: /GE\s*-\s*R|Goutte épaisse|R[ée]sultat GE|TDR paludisme/.test(t2),
        bpn_nfs: /NFS|Globules blancs/.test(t2),   // légitime → doit rester
      };
    });

    r.section('Lipides non commandés → absents du rendu');
    r.check('HDL absent', res.lip_hdl, false);
    r.check('Triglycérides absent', res.lip_tg, false);
    r.check('LDL absent', res.lip_ldl, false);
    r.check('Glycémie (commandée) présente', res.lip_gly, true);
    r.check('Sodium (commandé) présent', res.lip_na, true);

    r.section('GE non commandée → absente du bilan prénatal');
    r.check('GE absente', res.bpn_ge, false);
    r.check('NFS (commandée) présente', res.bpn_nfs, true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

// Le compte rendu imprimé d'un BILAN PRÉNATAL doit contenir la SÉROLOGIE.
//
// Cas réel (dossier de production 0256-0926, sept. 2026, saisi en série) : un
// bilan prénatal avec Ag HBs / TPHA / Toxoplasmose / Rubéole tous « Négatif ».
// En prod v13.171, un saut de page forcé renvoyait la sérologie sur une 3ᵉ
// feuille à moitié vide, souvent non imprimée — d'où « je ne vois pas la
// sérologie ». On vérifie ici que le chemin d'impression réel
// (prepareRecordForPrint → buildRecordPrintHTML → crBuildHTML) rend la
// sérologie du bilan prénatal, et qu'elle n'est pas filtrée par l'anti-fuite.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('BPN — SÉROLOGIE PRÉSENTE À L\'IMPRESSION');
  const srv = await serve(8177);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8177 });
    ctx = app.ctx; const { page, errors } = app;

    const out = await page.evaluate(async () => {
      const rec = {
        id: 1364, type: 'Dossier', est_bpn: true, montant: 10000,
        patient: { nom: 'TEST BPN', dossier: '0256-0926', sexe: 'F', age: '', date: '2026-09-17' },
        resultats: {
          _types: ['Hématologie', 'Groupe sanguin', 'Immuno-Sérologie', 'Biochimie'],
          _examens_coches: {
            'Biochimie': ['Glycémie à jeun', 'Urée', 'Créatinine'],
            'Hématologie': ['NFS — Numération Formule Sanguine', "Électrophorèse de l'hémoglobine", 'Bilan prénatal complet (forfait)'],
            'Groupe sanguin': ['Groupe sanguin ABO / Rhésus'],
            'Immuno-Sérologie': ['Ag HBs (Hépatite B)', 'TPHA / VDRL (Syphilis)', 'Toxoplasmose IgG / IgM', 'Rubéole IgG / IgM'],
          },
          'Hématologie': { 'Globules blancs (GB)': { valeur: '7.97', unite: '10³/µL', interp: 'Normal' }, 'Hémoglobine (Hb)': { valeur: '9.0', unite: 'g/dL', interp: 'Bas' } },
          'Biochimie': { 'Glycémie à jeun': { valeur: '0.59', unite: 'g/L', interp: 'Bas' }, 'Urée': { valeur: '0.22', unite: 'g/L', interp: 'Normal' }, 'Créatinine': { valeur: '9.5', unite: 'mg/L', interp: 'Normal' } },
          'Groupe sanguin': { 'Groupe ABO': 'O', 'Rhésus': 'Positif' },
          'Immuno-Sérologie': {
            'Ag HBs': { mode: 'qual', resultat: 'Négatif', valeur: '', unite: '', obs: '' },
            'TPHA / VDRL (Syphilis)': { mode: 'qual', resultat: 'Négatif', valeur: '', unite: '', obs: '' },
            'Toxoplasmose IgG': { mode: 'qual', resultat: 'Négatif', valeur: '', unite: 'UI/mL', obs: '' },
            'Toxoplasmose IgM': { mode: 'qual', resultat: 'Négatif', valeur: '', unite: '', obs: '' },
            'Rubéole IgG': { mode: 'qual', resultat: 'Négatif', valeur: '', unite: 'UI/mL', obs: '' },
            'VIH 1 & 2': { mode: 'qual', resultat: '', valeur: '', unite: '', obs: '' },
          },
        },
      };
      // Chemin d'impression réel d'un dossier multi-analyses.
      const pr = (typeof prepareRecordForPrint === 'function') ? prepareRecordForPrint(rec) : rec;
      const html = await buildRecordPrintHTML(pr);
      return {
        aghbs: /Ag HBs/.test(html),
        tpha: /TPHA|Syphilis/.test(html),
        toxo: /Toxoplasmose/.test(html),
        rub: /Rub[eé]ole/.test(html),
        // VIH vide et non demandé → ne doit PAS apparaître comme résultat.
        vihAbsent: !/VIH 1 &amp; 2|VIH 1 & 2/.test(html),
      };
    });

    r.section('Sérologie du bilan prénatal imprimée');
    r.check('Ag HBs présent', out.aghbs, true);
    r.check('TPHA / Syphilis présent', out.tpha, true);
    r.check('Toxoplasmose présente', out.toxo, true);
    r.check('Rubéole présente', out.rub, true);
    r.check('VIH (vide, non demandé) absent', out.vihAbsent, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

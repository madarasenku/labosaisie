// ✅ v13.139 — Le compte rendu imprimé doit suivre le modèle validé
// (référence : DIARRA_ROKIA — NFS + GE + CRP + Widal + Hépatite B + Biochimie).
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 9001, type: 'Dossier', montant: 50500, created_at: '2026-08-26T09:00:00Z',
  patient: { nom: 'DIARRA ROKIA', dossier: '0022-0826', sexe: 'F', age: '', date: '',
             medecin: 'EXTERNE', service: '', clinique: '' },
  resultats: {
    _types: ['Hématologie', 'Immuno-Sérologie', 'Biochimie'],
    _examens_coches: {
      'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'],
      'Immuno-Sérologie': ['CRP — Protéine C-réactive', 'Widal & Félix (SWF)', 'Ag HBs (Hépatite B)'],
      'Biochimie': ['Glycémie à jeun', 'Créatinine', 'ASAT (TGO)'],
    },
    'Hématologie': {
      'Globules blancs (GB)': { valeur: '8.09', unite: '10³/µL', interp: '' },
      'Globules rouges (GR)': { valeur: '3.96', unite: '10⁶/µL', interp: 'Bas' },
      'Hémoglobine (Hb)': { valeur: '12.3', unite: 'g/dL', interp: '' },
      'Plaquettes': { valeur: '155', unite: '10³/µL', interp: '' },
      'Lymphocytes': { valeur: '4854', unite: '/µL', interp: 'Élevé' },
      'GE - Résultat': 'Négatif', 'GE - TDR': 'Négatif',
    },
    'Immuno-Sérologie': {
      'CRP - Valeur': 'neg',
      'Widal - Conclusion': 'Négatif — pas d\'agglutination significative',
      'Ag HBs': { resultat: 'Positif', mode: 'qual' },
      'Ac anti-HBs': { valeur: '2.85', mode: 'quant', unite: 'UI/L' },
      'Ac anti-HBc total': { resultat: 'Positif', mode: 'qual' },
    },
    'Biochimie': {
      'Glycémie à jeun': { valeur: '0.89', unite: 'g/L', interp: '' },
      'Créatinine': { valeur: '9.2', unite: 'mg/L', interp: '' },
      'ASAT (TGO)': { valeur: '22', unite: 'UI/L', interp: '' },
      'ALAT (TGP)': { valeur: '24', unite: 'UI/L', interp: '' },
    },
  },
  created_by: 'YERIGUE', prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('COMPTE RENDU — CONFORMITÉ AU MODÈLE');
  const srv = await serve(8144);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8144 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate((d) => {
      window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
      _sb.rpc = async (n, p) => {
        if (n === 'get_resultats_light') { const res = {}; Object.keys(d.resultats).forEach(k => { if (k[0] === '_') res[k] = d.resultats[k]; }); return { data: [Object.assign({}, d, { resultats: res })], error: null }; }
        if (n === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__printed = null; return printRecord(9001); });
    await page.waitForTimeout(1800);
    const h = await page.evaluate(() => window.__printed || '');
    const txt = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    r.section('Structure du modèle');
    r.check('en-tête CPMI', /CPMI DE GRAND-BASSAM/.test(txt), true);
    r.check('sous-titre laboratoire', /Laboratoire d'analyses médicales/.test(txt), true);
    r.check('ligne RÉSULTAT avec examens', /RÉSULTAT : .*NFS.*GE.*CRP.*Widal.*Hépatite B.*Biochimie/.test(txt), true);
    r.check('nom patient en grand', /DIARRA ROKIA/.test(txt), true);
    r.check('grille infos (N° Dossier)', /N° Dossier/.test(txt) && /0022-0826/.test(txt), true);
    r.check('prescripteur', /Médecin prescripteur/.test(txt) && /EXTERNE/.test(txt), true);
    r.check('bandeau examens demandés', /Examens demandés — résultats/.test(txt), true);

    r.section('Tableaux par examen');
    r.check('tableau NFS', /NFS — Numération Formule Sanguine/.test(txt), true);
    r.check('colonnes Résultat/Unité/Valeurs normales', /Résultat.*Unité.*Valeurs normales/.test(txt), true);
    r.check('GE en tableau propre', /Goutte épaisse \/ TDR Paludisme/.test(txt), true);
    r.check('CRP', /CRP — Protéine C-réactive/.test(txt), true);
    r.check('CRP « neg » rendue « Négatif »', /Négatif/.test(txt) && !/\bneg\b/.test(txt), true);
    r.check('Widal', /Widal — Agglutination/.test(txt), true);
    r.check('Hépatite B', /Bilan Hépatite B \(VHB\)/.test(txt), true);
    r.check('interprétation VHB', /Interprétation : Infection par le virus de l'hépatite B/.test(txt), true);
    r.check('Biochimie — Glucides', /Biochimie — Glucides/.test(txt), true);
    r.check('Biochimie — Fonction rénale', /Biochimie — Fonction rénale/.test(txt), true);
    r.check('Biochimie — Fonction hépatique', /Biochimie — Fonction hépatique/.test(txt), true);

    r.section('Valeurs et anomalies');
    r.check('GB 8.09', /8\.09/.test(txt), true);
    r.check('GR 3.96 marqué anormal', /class="cr-val cr-ano">3\.96/.test(h), true);
    r.check('Lymphocytes 4854 anormal', /class="cr-val cr-ano">4854/.test(h), true);
    r.check('Ag HBs Positif anormal', /class="cr-val cr-ano">Positif/.test(h), true);

    r.section('Pied de page');
    r.check('montant', /Montant : 50 500 FCFA/.test(txt.replace(/ | /g, ' ')), true);
    r.check('signature technicien', /Signature du technicien/.test(txt), true);
    r.check('rappel patient en pied', /DIARRA ROKIA · N° 0022-0826/.test(txt), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

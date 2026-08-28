// ✅ v13.144 — Bilan prénatal : le compte rendu doit NOMMER le forfait, imprimer
// tous les examens saisis, et signaler « Non réalisé » ceux qui sont demandés
// mais pas encore rendus (condition du modèle validé).
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 2001, type: 'Dossier', montant: 20000, created_at: '2026-08-26T18:00:00Z', created_by: 'YERIGUE',
  patient: { nom: 'BPN ESSAI', dossier: '0380-0826', date: '2026-08-26', sexe: 'F', age: '27',
             medecin: 'SAGE-FEMME', service: 'Maternité', clinique: 'Grossesse 24 SA', paiement_status: 'paye' },
  resultats: {
    _types: ['Hématologie', 'Biochimie', 'Immuno-Sérologie', 'Groupe sanguin'],
    _facture_seule: false, _reception_seule: false,
    _examens_coches: {
      'Hématologie': ['Bilan prénatal complet (forfait)', 'NFS — Numération Formule Sanguine', "Électrophorèse de l'hémoglobine"],
      'Biochimie': ['Glycémie à jeun', 'Urée', 'Créatinine'],
      'Immuno-Sérologie': ['Sérologie VIH 1 & 2', 'Ag HBs (Hépatite B)', 'TPHA / VDRL (Syphilis)', 'Toxoplasmose IgG / IgM', 'Rubéole IgG / IgM'],
      'Groupe sanguin': ['Groupe sanguin ABO / Rhésus'],
    },
    _examens_prix: { 'Hématologie': { 'Bilan prénatal complet (forfait)': 20000 } },
    _montants: { 'Hématologie': 20000 },
    'Hématologie': { 'Globules blancs (GB)': { valeur: '6.4', unite: '10³/µL', interp: 'Normal' },
                     'Hémoglobine (Hb)': { valeur: '10.8', unite: 'g/dL', interp: 'Bas' } },
    'Biochimie': { 'Glycémie à jeun': { valeur: '0.85', unite: 'g/L', interp: 'Normal' },
                   'Créatinine': { valeur: '8.1', unite: 'mg/L', interp: 'Normal' },
                   'Urée': { valeur: '0.25', unite: 'g/L', interp: 'Normal' } },
    'Immuno-Sérologie': { 'VIH 1 & 2': { mode: 'qual', resultat: 'Négatif' },
                          'Ag HBs': { mode: 'qual', resultat: 'Négatif' },
                          'TPHA / VDRL (Syphilis)': { mode: 'qual', resultat: 'Négatif' },
                          'Toxoplasmose IgG': { mode: 'quant', valeur: '150', unite: 'UI/mL' } },
    'Groupe sanguin': { 'Groupe ABO': 'O', 'Rhésus': 'Positif' },
  },
  prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('BPN — COMPTE RENDU DU BILAN PRÉNATAL');
  const srv = await serve(8171);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8171 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate((d) => {
      window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (n, p) => {
        if (n === 'get_resultats_light') return { data: [light(d)], error: null };
        if (n === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(400);

    r.section('Reconnaissance du bilan prénatal');
    r.check('dossier reconnu comme BPN', await page.evaluate(() => estDossierBPN(getDB().find(x => x.id === 2001))), true);

    await page.evaluate(() => { window.__printed = null; return printRecord(2001); });
    await page.waitForTimeout(2000);
    const h = await page.evaluate(() => window.__printed || '');
    const txt = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    r.section('Contenu du compte rendu');
    r.check('le forfait est NOMMÉ en tête', /RÉSULTAT : Bilan prénatal complet/.test(txt), true);
    r.check('NFS imprimée', /NFS — Numération Formule Sanguine/.test(txt), true);
    r.check('Hb basse signalée', /class="cr-val cr-ano">10\.8/.test(h), true);
    r.check('sérologies imprimées', /VIH 1 & 2|VIH 1 &amp; 2/.test(txt), true);
    r.check('Hépatite B imprimée', /Bilan Hépatite B/.test(txt), true);
    r.check('biochimie rénale imprimée', /Biochimie — Fonction rénale/.test(txt), true);
    r.check('groupe sanguin imprimé', /Groupe ABO \/ Rhésus/.test(txt), true);

    r.section('Examens demandés mais non réalisés');
    r.check('bloc « non réalisés » présent', /Examens demandés — non réalisés/.test(txt), true);
    r.check('Électrophorèse signalée', /Électrophorèse de l'hémoglobine/.test(txt), true);
    r.check('Rubéole signalée', /Rubéole IgG \/ IgM/.test(txt), true);
    r.check('le forfait n\'est PAS listé comme non réalisé', /non réalisés[\s\S]*Bilan prénatal complet/.test(txt), false);
    r.check('Toxoplasmose (saisie) non listée', /non réalisés[\s\S]*Toxoplasmose/.test(txt), false);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

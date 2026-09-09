// ✅ v13.144 — Bilan prénatal : le compte rendu doit NOMMER le forfait, imprimer
// tous les examens saisis, et signaler « Non réalisé » ceux qui sont demandés
// mais pas encore rendus (condition du modèle validé).
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 2001, type: 'Dossier', montant: 10000, created_at: '2026-08-26T18:00:00Z', created_by: 'YERIGUE',
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

    r.section('Sérologies du BPN forcées en qualitatif');
    const modes = await page.evaluate(() => {
      showView('saisie');
      if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt('sero');
      if (typeof buildFicheExamens === 'function') buildFicheExamens();
      const cb = document.getElementById('ex_bpn');
      const o = { _case_bpn: cb ? 'présente' : 'ABSENTE' };
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof applyBpnSections === 'function') applyBpnSections();
      BPN_SERO_IDS.forEach(id => { const m = document.getElementById('smode_' + id);
        o[id] = m ? (m.value + (m.disabled ? '/verrouillé' : '/libre')) : 'absent'; });
      return o;
    });
    r.check('case « Bilan prénatal » présente', modes._case_bpn, 'présente');
    Object.keys(modes).filter(k => k !== '_case_bpn')
      .forEach(id => r.check('BPN ' + id, modes[id], 'qual/verrouillé'));
    const libere = await page.evaluate(() => {
      const cb = document.getElementById('ex_bpn');
      if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      
      if (typeof applyBpnSections === 'function') applyBpnSections();
      const m = document.getElementById('smode_toxo');
      return m ? (m.disabled ? 'verrouillé' : 'libre') : 'absent';
    });
    r.check('mode redevient libre hors BPN', libere, 'libre');

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

    // ✅ v13.160 — Plus de saut de page FORCÉ (remplissage « au plus juste » :
    //   le contenu remplit chaque feuille puis déborde proprement). On vérifie
    //   l'ORDRE des blocs : Hématologie (NFS) + Groupe AVANT Biochimie/Sérologies.
    r.section('Ordre des blocs (héma+groupe puis bio+séro), sans saut forcé');
    r.check('plus de saut de page forcé', /break-before:page/.test(h), false);
    const iNFS = txt.indexOf('NFS —');
    const iGroupe = txt.indexOf('Groupe ABO');
    const iBio = txt.indexOf('Biochimie — Fonction rénale');
    r.check('NFS (Hématologie) présent', iNFS >= 0, true);
    r.check('Groupe sanguin présent', iGroupe >= 0, true);
    r.check('Biochimie présente', iBio >= 0, true);
    r.check('NFS avant Groupe sanguin', iNFS < iGroupe, true);
    r.check('Hématologie + Groupe AVANT Biochimie', Math.max(iNFS, iGroupe) < iBio, true);
    r.check('Hépatite B présent', /Bilan Hépatite B/.test(txt), true);

    // ✅ v13.147 — Forfait affiché à 20 000 même si 10 000 saisi en caisse.
    r.section('Forfait affiché à 20 000 FCFA');
    r.check('montant CR forcé à 20 000', /Montant : 20 000 FCFA/.test(txt), true);
    r.check('le 10 000 saisi n\'apparaît pas', /Montant : 10 000 FCFA/.test(txt), false);

    // ✅ v13.157 — BPN : un examen demandé mais non saisi n'est PAS listé (ni
    //   « à compléter » ni « non réalisé ») — il peut revenir après coup (ECBU…).
    r.section('BPN : examens non saisis non listés');
    r.check('pas de bloc « à compléter »', /à compléter/.test(txt), false);
    r.check('pas de bloc « non réalisés »', /non réalisés/.test(txt), false);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

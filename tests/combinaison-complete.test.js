// ✅ v13.145 — Combinaison très large : NFS, GE, CRP, Widal, Urée, Glycémie,
// Créatinine, Transaminases, CT/HDL/LDL/TG, ionogramme, acide urique, et les
// sérologies (Ag HBs qual ET quant, Ac anti-HBc qual ET quant, Ac anti-HBs
// quant, Ac anti-VHC, Toxo, Rubéole, VIH, BW/TPHA, ASLO — majoritairement
// qualitatives). Saisie complète via le formulaire, enregistrement, impression.
const { serve, openApp, createReporter } = require('./helpers');

const COCHES = {
  'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'],
  'Biochimie': ['Glycémie à jeun', 'Urée', 'Créatinine', 'Acide urique',
                'ASAT / ALAT (Transaminases)', 'Cholestérol total', 'HDL-cholestérol',
                'Ionogramme (Na, K, Cl)'],
  'Immuno-Sérologie': ['CRP — Protéine C-réactive', 'Widal & Félix (SWF)',
                       'Sérologie VIH 1 & 2', 'Ag HBs (Hépatite B)', 'Ac anti-HBc totaux',
                       'Ac anti-HBs', 'Ac anti-VHC (Hépatite C)', 'TPHA / VDRL (Syphilis)',
                       'Toxoplasmose IgG / IgM', 'Rubéole IgG / IgM', 'ASLO (Antistreptolysines)'],
};
const doss = {
  id: 3001, type: 'Dossier', montant: 75000, created_at: '2026-08-26T18:00:00Z', created_by: 'YERIGUE',
  patient: { nom: 'COMBINAISON TOTALE', dossier: '0390-0826', date: '2026-08-26', sexe: 'M',
             age: '45', medecin: 'DR ESSAI', service: 'Consultation', clinique: 'Bilan complet',
             paiement_status: 'paye' },
  resultats: { _types: Object.keys(COCHES), _facture_seule: true, _reception_seule: false,
               _examens_coches: COCHES, _examens_prix: {}, _montants: { 'Hématologie': 3000, 'Biochimie': 25000, 'Immuno-Sérologie': 47000 } },
  prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('COMBINAISON COMPLÈTE — 21 EXAMENS, QUAL + QUANT');
  const srv = await serve(8180);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8180 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate((d) => {
      window.__store = [JSON.parse(JSON.stringify(d))];
      window.showConfirmModal = async () => true;
      window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; };
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (n, p) => {
        if (n === 'get_resultats_light') return { data: window.__store.map(light), error: null };
        if (n === 'get_resultat_full') { const x = window.__store.find(z => z.id === p.p_id); return { data: x ? [{ resultats: x.resultats }] : [], error: null }; }
        if (n === 'update_resultat') { const x = window.__store.find(z => z.id === p.p_id); if (x && p.p_resultats != null) x.resultats = p.p_resultats; return { data: Object.assign({ created_at: 'x', created_by: 'a' }, x), error: null }; }
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(400);

    r.section('Défauts des sérologies (majoritairement qualitatives)');
    const defauts = await page.evaluate(() => {
      const o = {}; ['vih1','hbsag','hbcac','hbsac','hcv','syphil','toxo','toxoig','rubig','aso']
        .forEach(id => { const t = SERO_TESTS.find(x => x.id === id); o[id] = t ? t.type : '?'; });
      return o;
    });
    r.check('VIH qual', defauts.vih1, 'qual');
    r.check('Ag HBs qual', defauts.hbsag, 'qual');
    r.check('Ac anti-HBc qual', defauts.hbcac, 'qual');
    r.check('Ac anti-HBs quant', defauts.hbsac, 'quant');
    r.check('Ac anti-VHC qual', defauts.hcv, 'qual');
    r.check('BW / TPHA qual', defauts.syphil, 'qual');
    r.check('Toxo IgG qual', defauts.toxo, 'qual');
    r.check('Rubéole IgG qual', defauts.rubig, 'qual');
    r.check('ASLO qual', defauts.aso, 'qual');

    // Ouvrir la fiche complète et tout saisir
    await page.evaluate(() => fillAllResults(3001));
    await page.waitForTimeout(1200);

    r.section('Saisie de tous les examens');
    const saisie = await page.evaluate(() => {
      const num = (id, v) => { const el = document.getElementById(id); if (!el) return 'ABSENT:' + id; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; };
      const sel = (id, v) => { const el = document.getElementById(id); if (!el) return 'ABSENT:' + id; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; };
      const mode = (id, m) => { const el = document.getElementById('smode_' + id); if (!el) return 'ABSENT:mode_' + id; el.value = m; el.dispatchEvent(new Event('change', { bubbles: true })); if (typeof toggleSeroMode === 'function') toggleSeroMode(id); return 'ok'; };
      const o = {};
      // Hématologie
      ['gbc:7.5','gr:4.8','hb:14.2','ht:43','plt:280','pnn:55','pne:3','pnb:1','lymp:35','mono:6']
        .forEach(p => { const [k, v] = p.split(':'); o['v_' + k] = num('v_' + k, v); });
      o.ge = sel('ge_result', 'Négatif'); o.tdr = sel('ge_tdr', 'Négatif');
      // Biochimie
      [['gly','0.95'],['uree','0.30'],['crea','11'],['ua','45'],['asat','28'],['alat','31'],
       ['chol','1.85'],['hdl','0.55'],['trig','1.20'],['na','140'],['k','4.2'],['cl','102']]
        .forEach(([k, v]) => { o['v_' + k] = num('v_' + k, v); });
      // CRP + Widal
      o.crp = sel('crp_valeur', '24');
      o.widal_to = sel('widal_to', '1/160'); o.widal_th = sel('widal_th', 'Négatif');
      // Sérologies QUALITATIVES
      [['vih1','Négatif'],['hcv','Négatif'],['syphil','Négatif'],
       ['toxo','Positif'],['toxoig','Négatif'],['rubig','Positif'],['aso','Négatif']]
        .forEach(([id, v]) => { o['mode_' + id] = mode(id, 'qual'); o['sr_' + id] = sel('sr_' + id, v); });
      // Ag HBs en QUANTITATIF (le mode doit rester libre hors BPN)
      o.mode_hbsag = mode('hbsag', 'quant'); o.sv_hbsag = num('sv_hbsag', '3.2');
      // Ac anti-HBc en QUALITATIF
      o.mode_hbcac = mode('hbcac', 'qual'); o.sr_hbcac = sel('sr_hbcac', 'Positif');
      // Ac anti-HBs en QUANTITATIF
      o.mode_hbsac = mode('hbsac', 'quant'); o.sv_hbsac = num('sv_hbsac', '125');
      return o;
    });
    const absents = Object.keys(saisie).filter(k => saisie[k] !== 'ok');
    r.check('tous les champs présents et remplis', absents.length ? absents.join(',') : 'aucun manquant', 'aucun manquant');

    await page.waitForTimeout(300);
    await page.evaluate(() => saveAllTabs());
    await page.waitForTimeout(1800);

    r.section('Contenu enregistré');
    const R = await page.evaluate(() => { const x = window.__store.find(z => z.id === 3001); return x.resultats; });
    r.check('GB', R['Hématologie'] && R['Hématologie']['Globules blancs (GB)'].valeur, '7.5');
    r.check('GE', R['Hématologie'] && R['Hématologie']['GE - Résultat'], 'Négatif');
    r.check('Glycémie', R['Biochimie'] && R['Biochimie']['Glycémie à jeun'].valeur, '0.95');
    r.check('Acide urique', R['Biochimie'] && R['Biochimie']['Acide urique'].valeur, '45');
    r.check('Cholestérol', R['Biochimie'] && R['Biochimie']['Cholestérol total'].valeur, '1.85');
    r.check('LDL calculé', !!(R['Biochimie'] && R['Biochimie']['LDL-cholestérol ⚙'] && R['Biochimie']['LDL-cholestérol ⚙'].valeur), true);
    r.check('Sodium', R['Biochimie'] && R['Biochimie']['Sodium (Na⁺)'].valeur, '140');
    r.check('CRP', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['CRP - Valeur'], '24');
    r.check('VIH qualitatif', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['VIH 1 & 2'].resultat, 'Négatif');
    r.check('Toxo IgG QUALITATIF', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['Toxoplasmose IgG'].resultat, 'Positif');
    r.check('Rubéole IgG QUALITATIF', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['Rubéole IgG'].resultat, 'Positif');
    r.check('ASLO qualitatif', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['ASLO (Antistreptolysines)'].resultat, 'Négatif');
    r.check('Ag HBs QUANTITATIF conservé', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['Ag HBs'].valeur, '3.2');
    r.check('Ac anti-HBc qualitatif', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['Ac anti-HBc total'].resultat, 'Positif');
    r.check('Ac anti-HBs quantitatif', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['Ac anti-HBs'].valeur, '125');
    r.check('Widal TO', R['Immuno-Sérologie'] && R['Immuno-Sérologie']['Widal - Salmonella typhi O (TO)'].titre, '1/160');

    r.section('Impression');
    await page.evaluate(() => { window.__printed = null; return printRecord(3001); });
    await page.waitForTimeout(2200);
    const h = await page.evaluate(() => window.__printed || '');
    const txt = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    r.check('NFS', /NFS — Numération Formule Sanguine/.test(txt), true);
    r.check('Goutte épaisse', /Goutte épaisse/.test(txt), true);
    r.check('CRP', /CRP — Protéine C-réactive/.test(txt), true);
    r.check('Widal', /Widal — Agglutination/.test(txt), true);
    r.check('Hépatite B', /Bilan Hépatite B/.test(txt), true);
    r.check('Sérologies', /Sérologies/.test(txt), true);
    r.check('lipides', /Biochimie — Bilan lipidique/.test(txt), true);
    r.check('ionogramme', /Biochimie — Ionogramme/.test(txt), true);
    r.check('fonction rénale', /Biochimie — Fonction rénale/.test(txt), true);
    r.check('aucun examen faussement « non réalisé »', /non réalisés/.test(txt), false);
    // ✅ v13.145 — Ag HBs saisi en QUANTITATIF doit figurer au compte rendu
    // (l'ancienne version ne lisait que le résultat qualitatif : il disparaissait).
    r.check('Ag HBs quantitatif imprimé', /Ag HBs \(antigène de surface\)[\s\S]{0,80}3\.2 UI\/L/.test(txt), true);
    r.check('Ac anti-HBs quantitatif imprimé', /125 UI\/L/.test(txt), true);
    r.check('Ac anti-HBc qualitatif imprimé', /Ac anti-HBc total \(contact viral\)[\s\S]{0,60}Positif/.test(txt), true);
    // Acide urique : bornes en mg/L, 45 est normal → ne doit PAS être signalé.
    r.check('acide urique référence mg/L', /Acide urique[\s\S]{0,80}25–70/.test(txt), true);
    r.check('acide urique NON signalé anormal', /cr-val cr-ano">45/.test(h), false);
    r.check('interprétation VHB cohérente', /Infection par le virus de l'hépatite B/.test(txt), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 8));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

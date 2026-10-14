// ✅ v13.135 — Récupération d'un dossier corrompu (sans « _examens_coches »,
// résultats présents) : la série le rouvre quand même, les examens ayant des
// données sont retrouvés, éditables, et la correction se ré-enregistre.
const { serve, openApp, createReporter } = require('./helpers');

// Dossier tel que corrompu par une version antérieure : CRP saisie, aucune
// métadonnée _examens_coches / _examens_prix / _montants ; type réduit.
const corrompu = {
  id: 995, type: 'Dossier', montant: 6500, created_at: '2026-08-26T09:00:00Z',
  patient: { nom: 'DOSSIER CORROMPU', dossier: '0995-0826', sexe: 'F', age: 28 },
  resultats: {
    _types: ['Immuno-Sérologie'], _facture_seule: false, _saisi_serie: { crp: true },
    'Immuno-Sérologie': {
      'CRP - Valeur': 'neg',
      'CRP - Interprétation': '✓ NÉGATIF — Absence de syndrome inflammatoire (CRP < 6 mg/L)',
      'VIH 1 & 2': { obs: '', mode: 'qual', unite: '', valeur: '', resultat: '' },
    },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('SÉRIE — RÉCUPÉRATION DOSSIER CORROMPU');
  const srv = await serve(8136);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8136 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d) => {
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') { const res = {}; Object.keys(d.resultats).forEach(k => { if (k[0] === '_') res[k] = d.resultats[k]; }); return { data: [Object.assign({}, d, { resultats: res })], error: null }; }
        if (nom === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, corrompu);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    // ✅ TOUT PAR LA SÉRIE — Ouvrir le dossier corrompu (chemin réel : benchOpenRecord
    //   → fillAllResults → série centrée sur le dossier).
    await page.evaluate(() => { if (typeof benchOpenRecord === 'function') return benchOpenRecord(995); return fillAllResults(995); });
    await page.waitForTimeout(1200);

    r.check('dossier rouvert dans la série', await page.evaluate(() => _grilleFocusId), 995);
    r.check('CRP retrouvée depuis les données', await page.evaluate(() => !!document.getElementById('g_995_crp_crp')), true);
    r.check('valeur CRP chargée (neg)', await page.evaluate(() => document.getElementById('g_995_crp_crp')?.value), 'neg');
    r.check('case CRP éditable', await page.evaluate(() => document.getElementById('g_995_crp_crp')?.disabled === false), true);
    // Correction : on change la valeur et on ré-enregistre (écriture réparatrice).
    const maj = await page.evaluate(async () => {
      window.__p = null;
      const prec = _sb.rpc;
      _sb.rpc = async (n, p) => { if (n === 'update_resultat') { window.__p = p; return { data: Object.assign({ id: 995, created_at: 'x' }, { patient: {}, resultats: p.p_resultats }), error: null }; } return prec(n, p); };
      const el = document.getElementById('g_995_crp_crp'); el.value = '12'; el.dispatchEvent(new Event('change', { bubbles: true }));
      const sel = document.getElementById('gsel_995'); if (sel && !sel.checked) { sel.checked = true; grilleSelToggle(995); }
      await grilleSaveAll();
      return window.__p && window.__p.p_resultats && window.__p.p_resultats['Immuno-Sérologie'] && window.__p.p_resultats['Immuno-Sérologie']['CRP - Valeur'];
    });
    r.check('correction enregistrée', maj, '12');

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 6));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

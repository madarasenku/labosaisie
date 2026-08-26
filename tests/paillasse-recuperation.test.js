// ✅ v13.135 — Récupération d'un dossier corrompu (sans « _examens_coches »,
// résultats présents) ouvert dans la paillasse : les panneaux réapparaissent,
// les examens ayant des données sont re-cochés, et tout est éditable pour
// permettre la correction / complétion puis un ré-enregistrement réparateur.
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
  const r = createReporter('PAILLASSE — RÉCUPÉRATION DOSSIER CORROMPU');
  const srv = await serve(8136);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8136 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d) => {
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') { const res = {}; Object.keys(d.resultats).forEach(k => { if (k[0] === '_') res[k] = d.resultats[k]; }); return { data: [Object.assign({}, d, { resultats: res })], error: null }; }
        if (nom === 'get_resultat_full') return { data: { resultats: d.resultats }, error: null };
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, corrompu);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    // Ouvrir le dossier corrompu dans la paillasse (chemin réel : benchOpenRecord → fillAllResults).
    await page.evaluate(() => { if (typeof benchOpenRecord === 'function') return benchOpenRecord(995); return fillAllResults(995); });
    await page.waitForTimeout(800);

    r.check('CRP re-cochée depuis les données', await page.evaluate(() => !!document.getElementById('ex_crp')?.checked), true);
    r.check('valeur CRP chargée (neg)', await page.evaluate(() => document.getElementById('crp_valeur')?.value), 'neg');
    r.check('champ CRP éditable', await page.evaluate(() => document.getElementById('crp_valeur')?.disabled === false), true);
    r.check('mode récupération : verrous désactivés', await page.evaluate(() => (typeof _locksDisabled !== 'undefined') ? _locksDisabled : null), true);
    r.check('panneau sérologie révélé', await page.evaluate(() => document.getElementById('panel-sero')?.classList.contains('active')), true);
    // On peut ré-ajouter un examen perdu (ex. NFS) : le panneau héma est visible.
    r.check('panneau héma visible (ré-ajout possible)', await page.evaluate(() => document.getElementById('panel-hema')?.classList.contains('active')), true);
    r.check('case NFS présente et cochable', await page.evaluate(() => { const c = document.getElementById('ex_nfs'); return !!c && c.disabled === false; }), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 6));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

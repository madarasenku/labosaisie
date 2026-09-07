// ✅ v13.154 — Correction en série : quand on rouvre une fiche déjà saisie
// (case « déjà saisis »), la grille doit PRÉ-REMPLIR les valeurs enregistrées,
// pour les voir et les corriger. Avant, les cases s'affichaient vides et la
// fiche semblait « se vider ».
const { serve, openApp, createReporter } = require('./helpers');

// Une fiche NFS déjà saisie partiellement (GB, Hb) + marquée saisie en série.
const A = {
  id: 971, type: 'Dossier', montant: 5000, created_at: '2026-09-06T09:00:00Z',
  patient: { nom: 'PATIENT PREFILL', dossier: '971', sexe: 'M', age: 30 },
  resultats: {
    _types: ['Hématologie'], _facture_seule: false,
    _saisi_serie: { nfs: true },
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] },
    'Hématologie': {
      'Globules blancs (GB)': { valeur: '8', unite: '10³/µL', interp: 'Normal' },
      'Hémoglobine (Hb)':     { valeur: '13', unite: 'g/dL', interp: 'Normal' },
    },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('GRILLE — PRÉ-REMPLISSAGE CORRECTION (déjà saisis)');
  const srv = await serve(8162);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8162 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate((d) => {
      window.__u = []; window.showConfirmModal = async () => true;
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: [light(d)], error: null };
        if (nom === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        return { data: [], error: null };
      };
    }, A);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(150);
    // Ouvrir la grille, toutes dates, avec « déjà saisis » actif.
    await page.evaluate(() => { _grilleDate = ''; _grilleInclureSaisis = true; window.ouvrirGrille('nfs'); });
    await page.waitForTimeout(800); // laisse le pré-remplissage async se faire

    r.section('Les valeurs enregistrées sont pré-remplies dans la grille');
    const cells = await page.evaluate(() => {
      const g = (k) => { const el = document.getElementById('g_971_nfs_' + k); return el ? el.value : null; };
      return { gbc: g('gbc'), hb: g('hb') };
    });
    r.check('case GB pré-remplie = 8', cells.gbc, '8');
    r.check('case Hb pré-remplie = 13', cells.hb, '13');

    r.section('Correction d’une valeur sans perdre l’autre');
    await page.evaluate(() => {
      const el = document.getElementById('g_971_nfs_gbc');
      if (el) { el.value = '9'; el.dispatchEvent(new Event('input', { bubbles: true })); }
      const cb = document.getElementById('gsel_971'); if (cb) { cb.checked = true; grilleSelToggle(971); }
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(900);

    const saved = await page.evaluate(() => {
      const u = window.__u[window.__u.length - 1];
      const h = u && u.p_resultats && u.p_resultats['Hématologie'];
      return h ? {
        gb: h['Globules blancs (GB)'] && h['Globules blancs (GB)'].valeur,
        hb: h['Hémoglobine (Hb)'] && h['Hémoglobine (Hb)'].valeur,
      } : null;
    });
    r.check('GB corrigé enregistré = 9', saved && saved.gb, '9');
    r.check('Hb NON saisie de nouveau, préservée = 13', saved && saved.hb, '13');

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

// ✅ v13.157 — Saisie en série de la GE : on renseigne la DENSITÉ parasitaire,
//   le résultat est déduit (densité > 0 → Positif ; = 0 → Négatif). La TDR est
//   OPTIONNELLE : une fiche est complète/enregistrable sans elle.
const { serve, openApp, createReporter } = require('./helpers');

const mk = (id, nom) => ({ id, type: 'Dossier', montant: 2000, created_at: '2026-09-06T09:00:00Z',
  patient: { nom, dossier: '' + id, sexe: 'M', age: 20 },
  resultats: { _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ['Goutte épaisse / TDR Paludisme'] },
    _examens_prix: { 'Hématologie': { 'Goutte épaisse / TDR Paludisme': 2000 } },
    _montants: { 'Hématologie': 2000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });

const A = mk(981, 'PALU POSITIF'), B = mk(982, 'PALU NEGATIF');

(async () => {
  const r = createReporter('GRILLE — GE DENSITÉ → RÉSULTAT DÉDUIT, TDR OPTIONNELLE');
  const srv = await serve(8154);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8154 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate((d) => {
      window.__u = []; window.showConfirmModal = async () => true;
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: d.map(light), error: null };
        if (nom === 'get_resultat_full') { const x = d.find(z => z.id === params.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        return { data: [], error: null };
      };
    }, [A, B]);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(150);
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('ge'); });
    await page.waitForTimeout(300);

    r.section('Colonnes de la GE');
    r.check('cellule densité présente', await page.evaluate(() => !!document.getElementById('g_981_ge_gedens')), true);
    r.check('cellule résultat présente', await page.evaluate(() => !!document.getElementById('g_981_ge_geres')), true);
    r.check('cellule TDR présente', await page.evaluate(() => !!document.getElementById('g_981_ge_getdr')), true);

    r.section('Densité > 0 → Positif (sans TDR), Densité 0 → Négatif');
    await page.evaluate(() => {
      const num = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      num('g_981_ge_gedens', '2400');  // A : positif
      num('g_982_ge_gedens', '0');     // B : négatif
    });
    await page.waitForTimeout(150);
    const derived = await page.evaluate(() => ({
      a: document.getElementById('g_981_ge_geres').value,
      b: document.getElementById('g_982_ge_geres').value,
      // la ligne A doit être auto-cochée (complète sans TDR)
      aChecked: document.getElementById('gsel_981').checked,
    }));
    r.check('A : résultat déduit = Positif', derived.a, 'Positif');
    r.check('B : résultat déduit = Négatif', derived.b, 'Négatif');
    r.check('A : ligne complète sans TDR (auto-cochée)', derived.aChecked, true);

    r.section('Enregistrement');
    await page.evaluate(() => {
      ['gsel_981', 'gsel_982'].forEach(id => { const cb = document.getElementById(id); if (cb && !cb.checked) { cb.checked = true; grilleSelToggle(+id.slice(5)); } });
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(900);
    const saved = await page.evaluate(() => {
      const get = id => { const u = window.__u.find(x => x.p_id === id); const h = u && u.p_resultats['Hématologie']; return h ? {
        res: h['GE - Résultat'], dens: h['GE - Densité parasitaire (/µL)'], tdr: h['GE - TDR'],
      } : null; };
      return { A: get(981), B: get(982) };
    });
    r.check('A : GE Résultat = Positif', saved.A && saved.A.res, 'Positif');
    r.check('A : densité enregistrée = 2400', saved.A && saved.A.dens, '2400');
    r.check('A : TDR vide (optionnelle)', !saved.A || !saved.A.tdr, true);
    r.check('B : GE Résultat = Négatif', saved.B && saved.B.res, 'Négatif');

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

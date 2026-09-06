// ✅ v13.151 — Non-régression (revue de code) : en saisie en série, l'éosinophile
// (calculé = 100−(neutro+lympho+mono)) d'un patient ne doit PAS « fuiter » vers le
// patient suivant dont la formule est incomplète. Comme PNE/PNB ne sont plus des
// colonnes de la grille, il faut que calcFLAuto vide l'éosino quand la formule
// n'est pas complète (sinon la valeur du patient précédent resterait dans le
// champ partagé du formulaire rejoué).
const { serve, openApp, createReporter } = require('./helpers');

const mk = (id, nom) => ({ id, type: 'Dossier', montant: 5000, created_at: '2026-09-06T09:00:00Z',
  patient: { nom, dossier: '' + id, sexe: 'M', age: 30 },
  resultats: { _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] },
    _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 5000 } },
    _montants: { 'Hématologie': 5000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });

const A = mk(961, 'PATIENT A'), B = mk(962, 'PATIENT B');

(async () => {
  const r = createReporter('GRILLE — PAS DE FUITE ÉOSINO ENTRE PATIENTS');
  const srv = await serve(8153);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8153 });
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
    await page.waitForTimeout(200);
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('nfs'); });
    await page.waitForTimeout(300);

    r.section('Patient A : formule complète ; Patient B : partielle (neutro seul)');
    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      // A : formule complète → éosino calculé
      set('g_961_nfs_gbc', '8'); set('g_961_nfs_pnn', '55'); set('g_961_nfs_lymp', '35'); set('g_961_nfs_mono', '7');
      // B : neutro seul (lympho/mono laissés vides) → éosino NON calculable
      set('g_962_nfs_gbc', '7'); set('g_962_nfs_pnn', '60');
      ['gsel_961', 'gsel_962'].forEach(id => { const cb = document.getElementById(id); if (cb) { cb.checked = true; grilleSelToggle(+id.slice(5)); } });
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(900);

    const res = await page.evaluate(() => {
      const get = id => { const p = window.__u.find(u => u.p_id === id); const h = p && p.p_resultats['Hématologie']; return h ? {
        pne: h['Polynucléaires éosinophiles (PNE)'] && h['Polynucléaires éosinophiles (PNE)'].valeur,
        pnb: h['Polynucléaires basophiles (PNB)'] && h['Polynucléaires basophiles (PNB)'].valeur,
      } : null; };
      return { A: get(961), B: get(962) };
    });
    // L'éosino est stocké en valeur ABSOLUE (= %calculé × GB), comme le reste de
    // la formule ; l'essentiel : A a une valeur calculée, B n'hérite de rien.
    r.check('A : éosino calculé (valeur présente)', !!(res.A && res.A.pne && res.A.pne !== ''), true);
    r.check('A : baso = 0', res.A && res.A.pnb, '0');
    r.check('B : éosino VIDE (pas la valeur de A)', !res.B || !res.B.pne || res.B.pne === '', true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

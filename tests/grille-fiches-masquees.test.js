// ✅ v13.148 — Saisie en série sur FICHES MASQUÉES.
// Une fiche masquée (restricted_by) disparaît de getDB() donc de la grille.
// Le nouveau filtre « fiches masquées » permet de l'afficher pour y saisir des
// résultats (admin : toutes ; sinon : les siennes). Le serveur applique de toute
// façon le contrôle de propriété sur update_resultat.
const { serve, openApp, createReporter } = require('./helpers');

const dossMasque = {
  id: 940, type: 'Dossier', montant: 5000, created_at: '2026-09-06T09:00:00Z', created_by: 'admin1',
  patient: { nom: 'FICHE MASQUEE', dossier: '0940-0906', sexe: 'M', age: 40 },
  resultats: { _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] },
    _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 5000 } },
    _montants: { 'Hématologie': 5000 } },
  prescripteur_id: 1, est_bpn: false, restricted_by: 'autreAgent', deleted_at: null };

(async () => {
  const r = createReporter('GRILLE — SAISIE SUR FICHES MASQUÉES');
  const srv = await serve(8150);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8150 });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate((d) => {
      window.__u = []; window.showConfirmModal = async () => true;
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: [light(d)], error: null };
        if (nom === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        if (nom === 'get_restriction_status') return { data: [{ id: 940, restricted_by: 'autreAgent' }], error: null };
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: 'autreAgent' }, error: null }; }
        return { data: [], error: null };
      };
    }, dossMasque);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);

    r.section('Fiche masquée exclue par défaut');
    r.check('masquée reconnue (restrictedBy)', await page.evaluate(() => { const r = getDB().find(x => x.id === 940); return r ? (r.restrictedBy || 'ABSENTE_DE_getDB') : 'ABSENTE_DE_getDB'; }), 'ABSENTE_DE_getDB');
    await page.evaluate(() => { _grilleDate = ''; _grilleInclureMasquees = false; window.ouvrirGrille('nfs'); });
    await page.waitForTimeout(200);
    r.check('absente de la grille sans le filtre', await page.evaluate(() => grilleDossiers().some(r => r.id === 940)), false);

    r.section('Filtre « fiches masquées » activé');
    await page.evaluate(() => window.grilleToggleMasquees(true));
    await page.waitForTimeout(200);
    r.check('présente dans la grille avec le filtre', await page.evaluate(() => grilleDossiers().some(r => r.id === 940)), true);
    r.check('cellule NFS présente', await page.evaluate(() => !!document.getElementById('g_940_nfs_gbc')), true);

    r.section('Saisie et enregistrement de la fiche masquée');
    await page.evaluate(() => {
      const num = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      num('g_940_nfs_gbc', '7.2'); num('g_940_nfs_gr', '4.8'); num('g_940_nfs_hb', '14');
      const cb = document.getElementById('gsel_940'); if (cb) { cb.checked = true; grilleSelToggle(940); }
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => {
      const p = window.__u.find(u => u.p_id === 940); const h = p && p.p_resultats['Hématologie'];
      return { gb: h && h['Globules blancs (GB)'] && h['Globules blancs (GB)'].valeur };
    });
    r.check('résultat NFS enregistré sur fiche masquée', saved.gb, '7.2');

    // ✅ v13.150 — Impression/export possible depuis une fiche masquée.
    r.section('Impression/export d\'une fiche masquée');
    r.check('recordForOutput retrouve la fiche masquée', await page.evaluate(() => { const r = recordForOutput(940); return !!(r && r.id === 940); }), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

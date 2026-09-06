// ✅ v13.147 — Saisie en série : l'électrophorèse de l'hémoglobine était absente
// de la grille (signalé : « je ne vois pas la partie pour insérer l'électrophorèse »
// lors de la saisie en série). On vérifie qu'elle apparaît, se saisit et
// s'enregistre au bon format (fractions 'Hb A'… + 'Profil Hb').
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 930, type: 'Dossier', montant: 6000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'EPHB SERIE', dossier: '0930-0826', sexe: 'F', age: 26 },
  resultats: { _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ["Électrophorèse de l'hémoglobine"] },
    _examens_prix: { 'Hématologie': { "Électrophorèse de l'hémoglobine": 6000 } },
    _montants: { 'Hématologie': 6000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null };

(async () => {
  const r = createReporter('GRILLE — ÉLECTROPHORÈSE DE L\'HÉMOGLOBINE');
  const srv = await serve(8147);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8147 });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate((d) => {
      window.__u = []; window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: d, error: null };
        if (nom === 'get_resultat_full') { const x = d.find(z => z.id === params.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'a', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, [doss]);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);

    r.section('Présence de l\'électrophorèse dans la grille');
    r.check('entrée EPHB au registre', await page.evaluate(() => !!(GRILLE_EXAMS && GRILLE_EXAMS.ephb)), true);
    r.check('EPHB dans l\'ordre d\'affichage', await page.evaluate(() => GRILLE_ORDRE.indexOf('ephb') >= 0), true);

    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('ephb'); });
    await page.waitForTimeout(300);
    r.check('dossier EPHB en attente', await page.evaluate(() => grillePending('ephb').length), 1);
    r.check('cellule fraction Hb A présente', await page.evaluate(() => !!document.getElementById('g_930_ephb_ephba')), true);
    r.check('cellule profil présente', await page.evaluate(() => !!document.getElementById('g_930_ephb_ephbprofil')), true);

    r.section('Saisie et enregistrement');
    await page.evaluate(() => {
      const num = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      const sel = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      num('g_930_ephb_ephba', '60');
      num('g_930_ephb_ephba2', '3');
      num('g_930_ephb_ephbs', '37');
      sel('g_930_ephb_ephbprofil', 'Profil AS (Drépanocytose trait)');
    });
    // Électrophorèse partielle (F, C non saisis) : la ligne ne s'auto-coche pas ;
    // le technicien coche « terminé » lui-même. On reproduit ce geste.
    await page.evaluate(() => { const cb = document.getElementById('gsel_930'); if (cb) { cb.checked = true; grilleSelToggle(930); } });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const saved = await page.evaluate(() => {
      const p = window.__u.find(u => u.p_id === 930); const h = p && p.p_resultats['Hématologie'];
      return {
        hba: h && h['Hb A'] && h['Hb A'].valeur,
        hbs: h && h['Hb S'] && h['Hb S'].valeur,
        profil: h && h['Profil Hb'],
        type: p && (p.p_resultats._types || []).includes('Hématologie'),
      };
    });
    r.check('Hb A enregistrée = 60', saved.hba, '60');
    r.check('Hb S enregistrée = 37', saved.hbs, '37');
    r.check('Profil enregistré', saved.profil, 'Profil AS (Drépanocytose trait)');
    r.check('type Hématologie présent', saved.type, true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

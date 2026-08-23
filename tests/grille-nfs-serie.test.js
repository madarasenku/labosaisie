// ✅ v13.119 — GRILLE PAILLASSE PAR EXAMEN : saisie NFS en série.
//
// On charge 2 dossiers en attente de NFS, on remplit leurs lignes dans la
// grille, on enregistre le lot, et on vérifie que CHAQUE dossier reçoit un
// enregistrement dont le JSON Hématologie a la bonne forme (produit par le
// vrai collectResults, donc identique à une saisie normale) avec la bonne
// valeur de GB.
const { serve, openApp, createReporter } = require('./helpers');

const DOSSIERS = [
  { id: 701, type: 'Dossier', montant: 3000, created_at: '2026-08-20T09:00:00Z',
    patient: { nom: 'ROW A', dossier: '0701-0826', sexe: 'F', age: 30 },
    resultats: { _types: ['Hématologie'], _facture_seule: true,
      _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] },
      _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 3000 } },
      _montants: { 'Hématologie': 3000 } },
    created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  { id: 702, type: 'Dossier', montant: 3000, created_at: '2026-08-20T09:05:00Z',
    patient: { nom: 'ROW B', dossier: '0702-0826', sexe: 'M', age: 45 },
    resultats: { _types: ['Hématologie'], _facture_seule: true,
      _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] },
      _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 3000 } },
      _montants: { 'Hématologie': 3000 } },
    created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
];

(async () => {
  const r = createReporter('GRILLE — SAISIE NFS EN SÉRIE');
  const srv = await serve(8111);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8111 });
    ctx = app.ctx;
    const { page, errors } = app;

    // Installer un mock RPC qui enregistre les appels update_resultat.
    await page.evaluate((dossiers) => {
      window.__updates = [];
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: dossiers, error: null };
        if (nom === 'get_resultat_full') {
          const d = dossiers.find(x => x.id === params.p_id);
          return { data: { resultats: d ? d.resultats : {} }, error: null };
        }
        if (nom === 'update_resultat') {
          window.__updates.push(params);
          return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient,
            resultats: params.p_resultats, montant: params.p_montant, created_at: '2026-08-20T10:00:00Z',
            created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null };
        }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, DOSSIERS);

    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(400);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);

    r.section('Ouverture de la grille');
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrilleNFS(); });
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => ({
      visible: document.getElementById('grille-serie').style.display !== 'none',
      lignes: document.querySelectorAll('#grille-serie tr[data-doss]').length,
    }));
    r.check('grille affichée', g.visible, true);
    r.check('2 dossiers en attente listés', g.lignes, 2);

    r.section('Remplir et enregistrer le lot');
    // Remplir la ligne 701 complètement, 702 aussi.
    const remplir = async (id, gb) => {
      const vals = { gbc: gb, gr: '4.5', hb: '13', ht: '40', plt: '250', pnn: '55', pne: '2', pnb: '0', lymp: '35', mono: '8' };
      for (const [col, v] of Object.entries(vals)) {
        await page.evaluate(([i, c, val]) => {
          const el = document.getElementById('g_' + i + '_' + c);
          if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
        }, [id, col, v]);
      }
    };
    await remplir(701, '7.2');
    await remplir(702, '9.8');
    await page.waitForTimeout(200);

    const ticks = await page.evaluate(() => ({
      t701: document.getElementById('gtick_701').style.visibility,
      t702: document.getElementById('gtick_702').style.visibility,
    }));
    r.check('ligne 701 marquée complète (✓)', ticks.t701, 'visible');
    r.check('ligne 702 marquée complète (✓)', ticks.t702, 'visible');

    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(900);

    const res = await page.evaluate(() => {
      const u = window.__updates;
      const byId = {};
      u.forEach(p => { byId[p.p_id] = p; });
      const gbOf = p => p && p.p_resultats && p.p_resultats['Hématologie']
        && p.p_resultats['Hématologie']['Globules blancs (GB)']
        && p.p_resultats['Hématologie']['Globules blancs (GB)'].valeur;
      return {
        n: u.length,
        gb701: gbOf(byId[701]),
        gb702: gbOf(byId[702]),
        // forme : la clé nommée + sous-objet {valeur,unite,interp}
        aUniteGB: !!(byId[701] && byId[701].p_resultats['Hématologie']['Globules blancs (GB)'].unite),
        typeInclus: byId[701] && byId[701].p_resultats._types.includes('Hématologie'),
        factureSeule: byId[701] && byId[701].p_resultats._facture_seule,
      };
    });
    r.check('2 enregistrements émis', res.n, 2);
    r.check('GB dossier 701 correct', res.gb701, '7.2');
    r.check('GB dossier 702 correct', res.gb702, '9.8');
    r.check('sous-objet GB a une unité (forme app)', res.aUniteGB, true);
    r.check('type Hématologie ajouté', res.typeInclus, true);
    r.check('facture_seule repassé à false', res.factureSeule, false);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
})();

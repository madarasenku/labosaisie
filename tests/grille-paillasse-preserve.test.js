// ✅ v13.132 — Régression paillasse + série :
//  A) une saisie paillasse en cours (valeurs tapées, non enregistrées) ne doit
//     PAS être perdue quand on enregistre un lot en série ;
//  B) si le détail complet d'un dossier ne peut pas être chargé (erreur réseau),
//     la série ne doit PAS enregistrer (sinon écrasement des autres analyses).
const { serve, openApp, createReporter } = require('./helpers');

const dossNfs = (id) => ({
  id, type: 'Dossier', montant: 5000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'SERIE NFS ' + id, dossier: '0' + id + '-0826', sexe: 'M', age: 40 },
  resultats: {
    _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ['NFS (Hémogramme)'] },
    _examens_prix: { 'Hématologie': { 'NFS (Hémogramme)': 5000 } },
    _montants: { 'Hématologie': 5000 },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});

(async () => {
  const r = createReporter('GRILLE — PAILLASSE PRÉSERVÉE + GARDE-FOU RÉSEAU');
  const srv = await serve(8132);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8132 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d) => {
      window.__u = []; window.__failFull = false; window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: d, error: null };
        if (nom === 'get_resultat_full') {
          if (window.__failFull) return { data: null, error: { message: 'réseau' } };
          const x = d.find(z => z.id === params.p_id); return { data: { resultats: x ? x.resultats : {} }, error: null };
        }
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, [dossNfs(940), dossNfs(941)]);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);

    // ── A) Simuler un patient paillasse actif : construire le panneau héma et
    //       taper une valeur GB « sentinelle » dans le formulaire partagé.
    r.section('A — valeur paillasse en cours préservée');
    const built = await page.evaluate(() => {
      if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt('hema');
      // Patient paillasse réaliste : l'examen NFS est coché ET une valeur GB tapée.
      const cb = document.getElementById('ex_nfs');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      const el = document.getElementById('v_gbc');
      if (!el) return false;
      el.value = '8888';                          // sentinelle = saisie paillasse non enregistrée
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    r.check('champ v_gbc disponible', built, true);

    // Enregistrer une NFS en série pour le dossier 940 (remplit puis vide v_gbc en interne).
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('nfs'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('g_940_gbc', '7.2'); set('g_940_gr', '4.5'); set('g_940_hb', '13'); set('g_940_ht', '40');
      set('g_940_plt', '250'); set('g_940_pnn', '55'); set('g_940_pne', '2'); set('g_940_pnb', '1');
      set('g_940_lymp', '35'); set('g_940_mono', '7');
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    r.check('940 bien enregistré en série', await page.evaluate(() => window.__u.some(u => u.p_id === 940)), true);
    r.check('valeur paillasse (v_gbc) préservée = 8888', await page.evaluate(() => document.getElementById('v_gbc')?.value), '8888');

    // ── B) Garde-fou réseau : get_resultat_full échoue → pas d'enregistrement destructeur.
    r.section('B — garde-fou : détail complet indisponible');
    await page.evaluate(() => { window.__u = []; window.__failFull = true; window.grilleChangeExam('nfs'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      // 941 est encore en attente ; on tente de le saisir.
      ['gbc','gr','hb','ht','plt','pnn','pne','pnb','lymp','mono'].forEach((k,i) => set('g_941_'+k, String(10+i)));
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    r.check('AUCUN update_resultat destructeur envoyé pour 941', await page.evaluate(() => window.__u.some(u => u.p_id === 941)), false);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();

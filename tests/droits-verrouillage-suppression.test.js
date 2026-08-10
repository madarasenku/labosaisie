// Nouvelles règles de droits (v13.82).
//
// Décidées après une constatation dans les données : les 106 dossiers
// impayés du laboratoire (607 500 FCFA) étaient TOUS verrouillés. Un dossier
// masqué disparaît aussi de l'écran « À encaisser » — le caissier ne peut
// donc pas encaisser ce qu'il ne voit pas. Le verrouillage engage trop pour
// rester ouvert à tous.
//
//   • verrouiller / déverrouiller → administrateur uniquement ;
//   • supprimer (corbeille)       → tout le monde, sur n'importe quel
//     dossier, mais tracé nominativement et réversible ;
//   • suppression DÉFINITIVE      → administrateur uniquement, inchangée ;
//   • spectateur                  → lecture seule, inchangé.
const { serve, openApp, createReporter, rows } = require('./helpers');

const preparer = (page) => page.evaluate((fiches) => {
  window.__appels = [];
  _sb.rpc = async (nom, params) => {
    window.__appels.push({ nom, params });
    if (nom === 'get_resultats_light') return { data: fiches, error: null };
    if (nom === 'soft_delete_dossier') return { data: 'ok', error: null };
    if (nom === 'toggle_restriction')  return { data: 'restricted', error: null };
    return { data: [], error: null };
  };
  window.showConfirmModal = async () => true;
}, rows());

// Le jeu d'essai : 101 appartient à agent1, 102 aussi, 104 à agent2.
const A_MOI = 101, A_UN_AUTRE = 104;

(async () => {
  const srv = await serve();
  const r = createReporter('DROITS — VERROUILLAGE ET SUPPRESSION');

  // ── Un agent peut supprimer le dossier d'un collègue ───────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Suppression ouverte à tous');
    await preparer(page);
    await page.evaluate((id) => softDeleteDossier(id), A_UN_AUTRE);
    await page.waitForTimeout(800);
    const appels = await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'soft_delete_dossier'));
    r.check('la suppression part au serveur', appels.length, 1);
    r.check('sur le bon dossier', appels[0] && appels[0].params.p_id, A_UN_AUTRE);

    // Et sur son propre dossier, évidemment.
    await preparer(page);
    await page.evaluate((id) => softDeleteDossier(id), A_MOI);
    await page.waitForTimeout(700);
    r.check('son propre dossier aussi', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'soft_delete_dossier').length), 1);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Mais il ne peut plus verrouiller ───────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Verrouillage réservé à l\'administrateur');
    await preparer(page);
    const msg = await page.evaluate(async (id) => {
      let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
      await toggleRestriction(id);
      window.toast = vrai; return capté;
    }, A_MOI);
    r.check('refus signalé', /administrateur/i.test(msg), true);
    // Même sur SA PROPRE fiche : c'était justement le cas autorisé avant.
    r.check('aucun appel au serveur', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'toggle_restriction').length), 0);

    await page.evaluate(() => { _selectedIds = new Set([101, 102]); });
    await page.evaluate(() => bulkLock());
    await page.evaluate(() => bulkUnlock());
    await page.waitForTimeout(700);
    r.check('verrouillage groupé bloqué aussi', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'toggle_restriction').length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Les boutons disparaissent au lieu de dire non ──────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Ce qui est interdit ne s\'affiche pas');
    // Il faut ouvrir l'Historique ET élargir la période : sans cela le tableau
    // est vide et un contrôle « aucun bouton interdit » passerait au vert
    // simplement parce qu'il n'y a aucune ligne du tout.
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(800);
    const lignes = await page.evaluate(() => {
      const b = document.getElementById('history-body');
      return b ? [...b.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length > 1).length : 0;
    });
    r.check('des lignes sont bien affichées', lignes > 0, true);

    const vu = await page.evaluate(() => {
      _selectedIds = new Set([101]);
      updateBulkToolbar();
      return {
        cadenas: document.querySelectorAll('[id^="lock-btn-"]').length,
        lot:     document.getElementById('bulk-lock-btn')?.style.display,
        lotDe:   document.getElementById('bulk-unlock-btn')?.style.display,
        // La corbeille, elle, doit rester proposée à tout le monde.
        poubelles: [...document.querySelectorAll('button')]
                     .filter(b => /softDeleteDossier/.test(b.getAttribute('onclick') || '')).length,
      };
    });
    r.check('aucun cadenas sur les lignes', vu.cadenas, 0);
    r.check('bouton de verrouillage groupé masqué', vu.lot, 'none');
    r.check('bouton de déverrouillage groupé masqué', vu.lotDe, 'none');
    r.check('la corbeille reste proposée', vu.poubelles > 0, true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── L'administrateur garde les deux ────────────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('L\'administrateur conserve tous les droits');
    await preparer(page);
    await page.evaluate((id) => toggleRestriction(id), A_UN_AUTRE);
    await page.waitForTimeout(800);
    r.check('verrouillage autorisé', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'toggle_restriction').length), 1);
    const vu = await page.evaluate(() => {
      _selectedIds = new Set([101]); updateBulkToolbar();
      return { lot: document.getElementById('bulk-lock-btn')?.style.display,
               suppr: document.getElementById('bulk-delete-btn')?.style.display };
    });
    r.check('bouton de verrouillage groupé visible', vu.lot !== 'none', true);
    r.check('suppression définitive visible', vu.suppr !== 'none', true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Le caissier aussi : « chacun » veut dire chacun ────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'caissier', username: 'caisse1', userId: 6,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Le caissier peut supprimer lui aussi');
    await preparer(page);
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(800);
    // Le caissier était exclu du bloc d'actions avec la duplication : la
    // corbeille en a été sortie exprès, sinon « chacun » l'oubliait.
    r.check('la corbeille lui est proposée', await page.evaluate(
      () => [...document.querySelectorAll('button')]
              .filter(b => /softDeleteDossier/.test(b.getAttribute('onclick') || '')).length) > 0, true);
    await page.evaluate((id) => softDeleteDossier(id), A_MOI);
    await page.waitForTimeout(700);
    r.check('la suppression part au serveur', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'soft_delete_dossier').length), 1);
    r.check('mais aucun cadenas', await page.evaluate(
      () => document.querySelectorAll('[id^="lock-btn-"]').length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Le spectateur ne touche toujours à rien ────────────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'spectateur', username: 'obs', userId: 5,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Le spectateur reste en lecture seule');
    await preparer(page);
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(800);
    r.check('des lignes sont bien affichées', await page.evaluate(() => {
      const b = document.getElementById('history-body');
      return b ? [...b.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length > 1).length : 0;
    }) > 0, true);
    await page.evaluate((id) => softDeleteDossier(id), A_MOI);
    await page.evaluate((id) => toggleRestriction(id), A_MOI);
    await page.waitForTimeout(800);
    r.check('aucune écriture', await page.evaluate(
      () => window.__appels.filter(a => /soft_delete_dossier|toggle_restriction/.test(a.nom)).length), 0);
    r.check('aucun bouton de suppression', await page.evaluate(
      () => [...document.querySelectorAll('button')]
              .filter(b => /softDeleteDossier/.test(b.getAttribute('onclick') || '')).length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Numéro libéré au bout de deux semaines (v13.83) ────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Dossier verrouillé dont le numéro a été libéré');
    // Le serveur retire `dossier` et conserve `ancien_dossier`. L'écran ne
    // doit pas laisser croire à une fiche corrompue, et la recherche doit
    // encore retrouver la fiche par son ancien numéro : un patient peut
    // revenir des semaines plus tard avec son reçu.
    await page.evaluate((fiches) => {
      const modifiees = fiches.map(f => f.id === 101
        ? { ...f, patient: (({ dossier, ...reste }) => ({ ...reste,
              ancien_dossier: dossier }))(f.patient) }
        : f);
      _sb.rpc = async (nom) => {
        if (nom === 'get_resultats_light') return { data: modifiees, error: null };
        return { data: [], error: null };
      };
    }, rows());
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(900);
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(900);
    await page.evaluate(() => setHistPeriode('tout'));
    await page.waitForTimeout(800);

    const ligne = await page.evaluate(() => {
      const tr = document.getElementById('row-101');
      return tr ? tr.textContent : '';
    });
    r.check('la ligne reste affichée', ligne.length > 0, true);
    r.check('l\'ancien numéro est montré', /D101/.test(ligne), true);
    r.check('et signalé comme ancien', /ex\./.test(ligne), true);

    // Recherche par l'ancien numéro.
    await page.evaluate(() => {
      const i = document.getElementById('search-input');
      i.value = 'D101'; i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(900);
    r.check('retrouvée par son ancien numéro', await page.evaluate(() => {
      const b = document.getElementById('history-body');
      return [...b.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length > 1).length;
    }), 1);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Un BPN interne se voit et s'encaisse comme les autres (v13.91) ──
  {
    // Un BPN interne et un dossier ordinaire, le même jour.
    const AUJ = new Date().toISOString().slice(0, 10);
    const JEU = [
      { id: 501, type: 'Hématologie', montant: 3000, created_at: AUJ + 'T08:00:00Z',
        created_by: 'agent1', patient: { nom: 'PATIENT ORDINAIRE', dossier: 'X1', date: AUJ },
        resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
      { id: 502, type: 'Dossier', montant: 10000, created_at: AUJ + 'T09:00:00Z',
        created_by: 'agent1', patient: { nom: 'PATIENTE BPN', dossier: 'X2', date: AUJ,
                                         medecin: 'SFDE KOUAME' },
        resultats: { _types: ['Hématologie'],
                     _examens_coches: { 'Hématologie': ['Bilan prénatal complet (forfait)'] } },
        prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
    ];

    for (const [role, username] of [
      ['agent', 'agent1'], ['caissier', 'caisse1'],
      ['spectateur', 'obs'], ['admin', 'admin1'],
    ]) {
      const { ctx, page, errors } = await openApp({
        role, username, userId: 3,
        rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: JEU },
      });
      r.section('Profil ' + role);
      const vu = await page.evaluate(() => ({
        // getDB alimente l'Historique et la recherche globale.
        affichees: (getDB() || []).map(x => x.patient?.dossier),
        // getCalcDB alimente la Caisse, les Statistiques et les Ristournes.
        calculees: (getCalcDB() || []).map(x => x.patient?.dossier),
      }));
      r.check('le dossier ordinaire reste visible', vu.affichees.includes('X1'), true);
      // ✅ v13.91 — Le BPN interne est visible de TOUS. L'avoir masqué le
      // sortait de « À encaisser » : le caissier ne pouvait plus prendre les
      // 10 000 FCFA, et le dossier serait resté impayé pour toujours sans
      // apparaître dans aucune liste d'impayés. Un dossier qu'on ne voit pas
      // est un dossier qu'on ne peut pas traiter.
      r.check('BPN interne visible à l\'écran', vu.affichees.includes('X2'), true);
      // Et il compte dans la caisse : la patiente paie bien au guichet. Le
      // cahier jaune suit ce qui est dû au personnel, il ne retire rien.
      r.check('et compté dans la caisse', vu.calculees.includes('X2'), true);
      r.check('aucune erreur JS', errors.length, 0);
      if (errors.length) console.log('   ', errors.slice(0, 3));
      await ctx.close();
    }
  }

  // ── Deux blocages signalés par l'administrateur (v13.90) ───────────
  {
    const AUJ = new Date().toISOString().slice(0, 10);
    // Un dossier à 2 analyses dont UNE n'a pas encore de résultats saisis :
    // c'est le cas de 633 des 658 dossiers multi-analyses en production.
    const JEU = [
      { id: 601, type: 'Dossier', montant: 6000, created_at: AUJ + 'T08:00:00Z',
        created_by: 'admin1', patient: { nom: 'PATIENT DEUX ANALYSES', dossier: 'Y1', date: AUJ },
        resultats: { _types: ['Hématologie', 'Biochimie'], 'Hématologie': { Hb: '12' } },
        prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
      { id: 602, type: 'Hématologie', montant: 3000, created_at: AUJ + 'T09:00:00Z',
        created_by: 'admin1', patient: { nom: 'PATIENT VERROUILLE', dossier: 'Y2', date: AUJ },
        resultats: {}, prescripteur_id: 1, est_bpn: false,
        restricted_by: 'admin', deleted_at: null },
    ];
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: JEU,
        get_restriction_status: [{ id: 602, restricted_by: 'admin' }] },
    });

    r.section('Supprimer une analyse dont les résultats ne sont pas saisis');
    const res = await page.evaluate(async () => {
      window.__appels = [];
      const vraiRpc = _sb.rpc;
      _sb.rpc = async (nom, params) => {
        window.__appels.push({ nom, params });
        if (nom === 'get_resultat_full')
          return { data: { resultats: { _types: ['Hématologie','Biochimie'],
                                        'Hématologie': { Hb: '12' } } }, error: null };
        // Le RPC renvoie la LIGNE mise à jour, pas 'ok' : un simulacre
        // infidèle faisait recopier `undefined` dans le cache et
        // l'Historique cessait de s'afficher. C'est ce qui a fait ajouter
        // un garde-fou dans updateRecordRemote.
        if (nom === 'update_resultat') return { data: {
          id: 601, type: 'Dossier', patient: { nom: 'PATIENT DEUX ANALYSES', dossier: 'Y1' },
          resultats: params.p_resultats, created_at: new Date().toISOString(),
          created_by: 'admin1', montant: params.p_montant, prescripteur_id: 1,
          est_bpn: false }, error: null };
        return { data: [], error: null };
      };
      window.showConfirmModal = async () => true;
      let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
      await deleteAnalyseFromDossier(601, 'Biochimie');
      window.toast = vrai; _sb.rpc = vraiRpc;
      return { capté, appels: window.__appels.map(a => a.nom) };
    });
    // Le message accusait le réseau alors que tout allait bien : une analyse
    // cochée mais non remplie est le cas NORMAL, et justement celui où l'on
    // veut la retirer.
    r.check('plus de faux message réseau', /non chargé/.test(res.capté), false);
    r.check('la suppression atteint le serveur',
            res.appels.includes('update_resultat'), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));

    r.section('Actions de groupe sur les fiches verrouillées');
    const coches = await page.evaluate(async () => {
      showView('historique');
      await new Promise(r => setTimeout(r, 900));
      setHistPeriode('tout');
      await new Promise(r => setTimeout(r, 700));
      toggleMasquees();                       // passer en vue « verrouillées »
      await new Promise(r => setTimeout(r, 700));
      const cases = [...document.querySelectorAll('#history-body input[type=checkbox]')];
      return { total: cases.length,
               desactivees: cases.filter(c => c.disabled).length,
               selectionnables: cases.filter(c => c.classList.contains('bulk-chk')).length };
    });
    r.check('la fiche verrouillée est listée', coches.total > 0, true);
    // C'est justement sur ces fiches que l'admin a besoin d'agir en masse :
    // déverrouiller un lot, encaisser, supprimer.
    r.check('sa case n\'est plus désactivée', coches.desactivees, 0);
    r.check('et elle entre dans la sélection', coches.selectionnables > 0, true);

    const selection = await page.evaluate(async () => {
      toggleRowSelect(602, true);
      const apres = _selectedIds.size;
      toggleMasquees();                       // revenir à la vue normale
      await new Promise(r => setTimeout(r, 500));
      // Une sélection oubliée agirait sur des lignes devenues invisibles.
      return { apres, apresChangementDeVue: _selectedIds.size };
    });
    r.check('la sélection fonctionne', selection.apres, 1);
    r.check('et se vide en changeant de vue', selection.apresChangementDeVue, 0);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

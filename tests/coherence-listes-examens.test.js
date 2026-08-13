// Cohérence des différentes LISTES d'examens.
//
// L'application manipule plusieurs listes qui doivent rester alignées :
//   • CATALOGUE_EXAMENS      — les cases à cocher / la facturation (fiche)
//   • examFieldIds(...)      — les champs de saisie verrouillés par examen
//   • les sections sec-*     — les blocs de résultats affichés/masqués
//   • SERO_TESTS, HEMA_*,    — les paramètres réellement rendus dans les
//     BIO_*, EPHB_FRACTIONS    panneaux
//
// Si ces listes divergent, on obtient soit un examen facturable sans champ où
// saisir, soit un champ de résultat qu'aucun examen ne facture (donc jamais
// verrouillé). Ce fichier détecte ces écarts, onglet par onglet, et vérifie
// aussi la granularité sérologique (cocher un test n'ouvre pas les autres).
const { serve, openApp, createReporter } = require('./helpers');

// Examens sans champ de saisie propre, par conception :
//  • bactério  → panneau libre, verrouillé en bloc (#panel-bacterio)
//  • RAI       → partage le panneau Groupe sanguin, pas de champ dédié
//  • BPN       → forfait, pas de panneau de résultats
const SANS_CHAMP = ['ex_ecbu','ex_hemo','ex_copro','ex_pg','ex_pus','ex_rai','ex_bpn'];

// Champs de résultat volontairement « contextuels » (toujours présents, non
// rattachés à un examen facturable) : mini-groupe sanguin affiché sur l'onglet
// Sérologie pour information.
const CHAMPS_CONTEXTE = ['gs_abo_hema','gs_rh_hema'];

(async () => {
  const srv = await serve();
  const r = createReporter('COHÉRENCE DES LISTES D\'EXAMENS');

  const { ctx, page, errors } = await openApp({ role: 'admin',
    rpc: { get_tarifs: {}, get_examens_custom: [] } });

  const audit = await page.evaluate(({ SANS_CHAMP, CHAMPS_CONTEXTE }) => {
    ['hema','bio','bacterio','sero','parasito','gs'].forEach(n => {
      try { ensurePanelBuilt(n); } catch (e) {} });

    const cat = getCatalogueComplet();
    const sansChamp = new Set(SANS_CHAMP);

    // 1) Chaque examen du catalogue a une case à cocher sur la fiche.
    const sansCase = cat.filter(e => !document.getElementById(e.id)).map(e => e.id);

    // 2) Chaque examen a un endroit où saisir : soit des champs identifiés
    //    (examFieldIds) présents dans le DOM, soit une section existante.
    const sansEndroit = [];
    cat.forEach(e => {
      if (sansChamp.has(e.id)) return;
      const champs = examFieldIds(e.id).map(i => document.getElementById(i)).filter(Boolean);
      const secOk  = e.section && document.getElementById(e.section);
      if (!champs.length && !secOk) sansEndroit.push(e.id);
    });

    // 3) Chaque identifiant renvoyé par examFieldIds existe réellement dans le
    //    DOM (détecte une dérive d'identifiant comme l'ancien « v_ephb_a »).
    const champsFantomes = [];
    cat.forEach(e => {
      examFieldIds(e.id).forEach(fid => {
        if (!document.getElementById(fid)) champsFantomes.push(e.id + ':' + fid);
      });
    });

    // 4) Sérologie : chaque test de SERO_TESTS est couvert par un examen sero.
    const seroRefs = new Set();
    cat.filter(e => e.tab === 'sero').forEach(e => {
      examFieldIds(e.id).forEach(fid => {
        const m = fid.match(/^s[orv]_(.+?)(?:_r)?$/); // so_x / sr_x / sr_x_r / sv_x
        if (m) seroRefs.add(m[1]);
      });
    });
    const seroTests = (typeof SERO_TESTS !== 'undefined') ? SERO_TESTS.map(t => t.id) : [];
    const seroNonCouverts = seroTests.filter(id => !seroRefs.has(id));

    // 5) Aucun champ de VALEUR rendu (v_*) sans examen propriétaire : on
    //    rassemble tous les champs possédés (union des examFieldIds) et on
    //    liste les <input> v_* de bio/héma qui n'appartiennent à personne.
    const possedes = new Set();
    cat.forEach(e => examFieldIds(e.id).forEach(id => possedes.add(id)));
    const contexte = new Set(CHAMPS_CONTEXTE);
    const orphelins = [];
    document.querySelectorAll('#panel-hema [id^="v_"], #panel-bio [id^="v_"]').forEach(el => {
      const id = el.id;
      if (!possedes.has(id) && !contexte.has(id)) orphelins.push(id);
    });

    return { total: cat.length, sansCase, sansEndroit, champsFantomes,
             seroNonCouverts, orphelins };
  }, { SANS_CHAMP, CHAMPS_CONTEXTE });

  r.section('Catalogue ↔ fiche ↔ champs de saisie');
  r.check('examens au catalogue', audit.total > 0, true);
  r.check('chaque examen a sa case sur la fiche',
          audit.sansCase.length ? audit.sansCase.join(', ') : 'toutes', 'toutes');
  r.check('chaque examen a un endroit où saisir',
          audit.sansEndroit.length ? audit.sansEndroit.join(', ') : 'oui', 'oui');
  r.check('aucun identifiant de champ fantôme',
          audit.champsFantomes.length ? audit.champsFantomes.join(', ') : 'aucun', 'aucun');

  r.section('Listes de paramètres ↔ catalogue');
  r.check('chaque test SERO_TESTS est facturable',
          audit.seroNonCouverts.length ? audit.seroNonCouverts.join(', ') : 'oui', 'oui');
  r.check('aucun champ v_* sans examen propriétaire',
          audit.orphelins.length ? audit.orphelins.join(', ') : 'aucun', 'aucun');
  r.check('aucune erreur JS', errors.length, 0);
  await ctx.close();

  // ── Granularité sérologique ──────────────────────────────────────
  // Cocher UN test sérologique ne doit ouvrir QUE ses champs, pas ceux des
  // autres tests du même panneau (sec-sero est partagé par 12 examens).
  {
    r.section('Sérologie : cocher un test n\'ouvre pas les autres');
    const { ctx, page, errors } = await openApp({ role: 'admin',
      rpc: { get_tarifs: {}, get_examens_custom: [] } });

    const g = await page.evaluate(() => {
      ['sero'].forEach(n => { try { ensurePanelBuilt(n); } catch (e) {} });
      _editingRecordId = 777777;
      localStorage.setItem('v2_labosaisie_paiements_v1', JSON.stringify({ 777777: 'paye' }));
      const cat = getCatalogueComplet();
      cat.forEach(e => { const cb = document.getElementById(e.id); if (cb) cb.checked = false; });
      // On coche uniquement VIH (qualitatif).
      document.getElementById('ex_vih').checked = true;
      applyExamLocks();
      const dispo = id => { const el = document.getElementById(id); return el && !el.disabled; };
      return {
        vih_ouvert:   dispo('sr_vih1'),                 // doit être ouvert
        hbs_ferme:    !dispo('sr_hbsag'),               // doit rester fermé
        tsh_ferme:    !dispo('sv_tsh'),                 // (quantitatif) fermé
        obs_hbs_ferme: !dispo('so_hbsag'),              // commentaire d'un autre test fermé
      };
    });
    r.check('le test coché (VIH) est ouvert',            g.vih_ouvert, true);
    r.check('un autre test qualitatif (HBs) reste fermé', g.hbs_ferme, true);
    r.check('un test quantitatif non coché (TSH) reste fermé', g.tsh_ferme, true);
    r.check('le commentaire d\'un autre test reste fermé', g.obs_hbs_ferme, true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

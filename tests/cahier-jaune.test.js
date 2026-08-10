// Cahier jaune (v13.86).
//
// Reprise du cahier Excel tenu par le laboratoire. La forme suit le fichier
// réel : une ligne par jour ouvré, des colonnes nommées, des montants
// négatifs pour les sorties, un sous-total par semaine, un total du mois.
// Le personnel doit reconnaître son cahier — c'est ce que ces contrôles
// vérifient, autant que l'arithmétique.
const { serve, openApp, createReporter } = require('./helpers');

// Mois FIXE et passé : le cahier est un registre mensuel, pas un calcul
// relatif à aujourd'hui. Le figer ici ne crée pas de bombe à retardement,
// contrairement à une date « du jour » (voir tests/README.md) — mais on
// vérifie tout de même que les jours calculés correspondent au calendrier.
const MOIS = '2026-06';

const COLONNES = [
  { id: 1, libelle: 'SFPMI', ordre: 10, archivee: false },
  { id: 2, libelle: 'SFHG', ordre: 20, archivee: false },
  { id: 3, libelle: 'SOUS-TRAITANCE', ordre: 30, archivee: false },
];

// Reprise de la première semaine réelle du cahier de mai 2026, pour que les
// totaux attendus viennent du document du laboratoire et non de mon calcul.
const ECRITURES = [
  { id: 1, jour: '2026-06-01', colonne_id: 1, montant: 60000, origine: 'manuelle' },
  { id: 2, jour: '2026-06-01', colonne_id: 3, montant: -6000, explication: 'sous-traitance', origine: 'manuelle' },
  { id: 3, jour: '2026-06-03', colonne_id: 1, montant: 20000, origine: 'manuelle' },
  { id: 4, jour: '2026-06-03', colonne_id: 3, montant: -2000, explication: 'sous-traitance', origine: 'manuelle' },
  { id: 5, jour: '2026-06-05', colonne_id: 1, montant: 30000, origine: 'manuelle' },
  { id: 6, jour: '2026-06-05', colonne_id: 2, montant: 30000, origine: 'manuelle' },
  { id: 7, jour: '2026-06-05', colonne_id: 3, montant: -5000, explication: 'sous-traitance', origine: 'manuelle' },
  // Un BPN interne reporté automatiquement par la base.
  { id: 8, jour: '2026-06-08', colonne_id: 1, montant: 10000,
    explication: 'BPN interne — SANKARA AWA (0092-0626)', origine: 'bpn_interne', resultat_id: 685 },
];
// SFPMI 60000+20000+30000+10000 = 120 000 · SFHG 30 000 · SOUS-TRAITANCE -13 000
const TOTAL_MOIS = 137000;

const preparer = (page, extra) => page.evaluate(([cols, ecr, sup]) => {
  window.__appels = [];
  _sb.rpc = async (nom, params) => {
    window.__appels.push({ nom, params });
    if (nom === 'get_cahier_jaune') return { data: { mois: params.p_mois, colonnes: cols, ecritures: ecr }, error: null };
    if (nom in sup) return { data: sup[nom], error: null };
    return { data: [], error: null };
  };
}, [COLONNES, ECRITURES, extra || {}]);

(async () => {
  const srv = await serve();
  const r = createReporter('CAHIER JAUNE');

  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Le tableau reprend la forme du cahier');
    await preparer(page);
    await page.evaluate(m => chargerCahierJaune(m), MOIS);
    await page.waitForTimeout(900);

    const vu = await page.evaluate(() => {
      const t = document.querySelector('#cahier-tableau table');
      if (!t) return null;
      const entetes = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim());
      const semaines = [...t.querySelectorAll('tbody tr')]
        .filter(tr => /^SEMAINE/.test(tr.children[0].textContent.trim()))
        .map(tr => [...tr.children].map(td => td.textContent.trim()));
      const pied = [...t.querySelectorAll('tfoot td')].map(td => td.textContent.trim());
      const jours = [...t.querySelectorAll('tbody tr')]
        .filter(tr => !/^SEMAINE/.test(tr.children[0].textContent.trim())).length;
      return { entetes, semaines, pied, jours };
    });

    r.check('une colonne par intervenant', vu && vu.entetes.includes('SFPMI'), true);
    r.check('SOUS-TRAITANCE aussi', vu && vu.entetes.includes('SOUS-TRAITANCE'), true);
    r.check('une colonne TOTAL', vu && vu.entetes.includes('TOTAL'), true);
    // Juin 2026 compte 22 jours ouvrés : le cahier ne tient pas le week-end.
    r.check('un jour ouvré par ligne', vu && vu.jours, 22);
    r.check('des sous-totaux hebdomadaires', vu && vu.semaines.length, 5);
    r.check('le pied porte le total du mois',
            vu && vu.pied.some(c => /137\s?000/.test(c)), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));

    r.section('Arithmétique');
    // La première semaine du cahier réel : 110 000 − 13 000 = 97 000 pour
    // SFPMI et la sous-traitance, plus 30 000 de SFHG.
    const s1 = vu.semaines[0];
    r.check('SFPMI de la semaine 1', /110\s?000/.test(s1[1]), true);
    r.check('SFHG de la semaine 1', /30\s?000/.test(s1[2]), true);
    // Une sortie doit rester NÉGATIVE : un signe perdu et le cahier
    // additionne ce qu'il devrait retrancher.
    r.check('la sous-traitance reste négative', /-13\s?000/.test(s1[3]), true);
    r.check('total de la semaine 1', /127\s?000/.test(s1[4]), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Saisie d\'une écriture');
    await preparer(page, { ajouter_ecriture_cahier: { id: 99 } });
    await page.evaluate(m => chargerCahierJaune(m), MOIS);
    await page.waitForTimeout(800);

    // Une sortie sans explication doit être refusée AVANT d'atteindre le
    // serveur : c'est exactement ce que la colonne EXPLICATION du fichier
    // Excel sert à empêcher.
    const refus = await page.evaluate(async () => {
      await ouvrirSaisieCahier('2026-06-10');
      document.getElementById('cj-montant').value = '-5000';
      document.getElementById('cj-explication').value = '';
      await enregistrerEcritureCahier('2026-06-10');
      return { msg: document.getElementById('cj-err')?.textContent || '',
               appels: window.__appels.filter(a => a.nom === 'ajouter_ecriture_cahier').length };
    });
    r.check('sortie sans explication refusée', /expliqu/i.test(refus.msg), true);
    r.check('et rien n\'est envoyé au serveur', refus.appels, 0);

    const ok = await page.evaluate(async () => {
      document.getElementById('cj-explication').value = 'MR NGUESSAN';
      await enregistrerEcritureCahier('2026-06-10');
      return window.__appels.filter(a => a.nom === 'ajouter_ecriture_cahier');
    });
    r.check('une sortie expliquée passe', ok.length, 1);
    r.check('le montant reste négatif', ok[0] && ok[0].params.p_montant, -5000);
    r.check('l\'explication accompagne', ok[0] && ok[0].params.p_explication, 'MR NGUESSAN');
    r.check('sur le bon jour', ok[0] && ok[0].params.p_jour, '2026-06-10');
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openApp({
      role: 'spectateur', username: 'obs', userId: 5,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Le spectateur lit sans écrire');
    await preparer(page);
    await page.evaluate(m => chargerCahierJaune(m), MOIS);
    await page.waitForTimeout(900);
    r.check('le cahier s\'affiche', await page.evaluate(
      () => !!document.querySelector('#cahier-tableau table')), true);
    r.check('aucun bouton d\'ajout', await page.evaluate(
      () => [...document.querySelectorAll('#cahier-tableau button')]
              .filter(b => /ouvrirSaisieCahier/.test(b.getAttribute('onclick') || '')).length), 0);
    const msg = await page.evaluate(async () => {
      let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
      await ouvrirSaisieCahier('2026-06-10');
      window.toast = vrai; return capté;
    });
    r.check('la saisie lui est refusée', /lecture seule/i.test(msg), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Le cahier ne concerne pas les agents');
    r.check('onglet masqué', await page.evaluate(
      () => document.getElementById('btn-nav-cahier')?.style.display), 'none');
    r.check('vue inaccessible', await page.evaluate(() => {
      showView('cahier');
      return document.getElementById('view-cahier')?.style.display;
    }), 'none');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

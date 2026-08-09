// Ristournes et Prescripteurs (v13.74).
//
// Ristournes : les sélecteurs mois/année fonctionnaient, mais consulter
// trois mois d'affilée demandait deux manipulations à chaque fois. Des
// flèches ◀ ▶ les encadrent désormais.
//
// Prescripteurs : la liste (25 en production) n'avait aucune recherche ;
// retrouver un nom se faisait à l'œil dans le tableau.
const { serve, openApp, createReporter, ATTENDU, FICHES } = require('./helpers');

const PRESCRIPTEURS = [
  { id: 1, nom: 'DR ALPHA KOUASSI',  specialite: 'Gynécologie',      structure: 'CPMI',           actif: true, taux_ristourne: 10 },
  { id: 2, nom: 'DR BETA TRAORE',    specialite: 'Pédiatrie',        structure: 'Clinique Sainte', actif: true, taux_ristourne: 5 },
  { id: 3, nom: 'DR GAMMA YAO',      specialite: 'Médecine générale', structure: 'CPMI',           actif: true, taux_ristourne: 0 },
];

const moisPrec = FICHES.filter(f => f[1].startsWith(ATTENDU.moisPrecedentPrefixe));

(async () => {
  const srv = await serve();
  const r = createReporter('RISTOURNES & PRESCRIPTEURS');
  const { ctx, page, errors } = await openApp({
    role: 'admin', rpc: { get_prescripteurs: PRESCRIPTEURS },
  });

  // ─────────────── RISTOURNES (Caisse) ───────────────
  await page.evaluate(() => showView('caisse'));
  await page.waitForTimeout(1800);

  r.section('Ristournes — flèches autour du sélecteur de mois');
  r.check('flèche « mois suivant » présente', await page.evaluate(
    () => !!document.getElementById('rist-mois-suivant')), true);

  const moisAffiche = () => page.evaluate(
    () => Number(document.getElementById('rist-mois')?.value));
  const anneeAffichee = () => page.evaluate(
    () => Number(document.getElementById('rist-annee')?.value));
  const libelle = () => page.evaluate(
    () => document.getElementById('rist-mois-label')?.textContent || '');

  // Le sélecteur démarre sur le mois en cours.
  r.check('mois initial = mois courant', await moisAffiche(), ATTENDU.moisCourantNum);
  r.check('libellé renseigné', (await libelle()).length > 3, true);
  r.check('flèche ▶ désactivée sur le mois courant', await page.evaluate(
    () => document.getElementById('rist-mois-suivant').disabled), true);

  await page.evaluate(() => decalerSelecteursMois('rist-mois', 'rist-annee', -1, renderRistournesMois));
  await page.waitForTimeout(800);
  r.check('◀ → mois précédent', await moisAffiche(), ATTENDU.moisPrecedentNum);
  r.check('◀ → année cohérente', await anneeAffichee(), ATTENDU.moisPrecedentAnnee);
  r.check('libellé mis à jour', await libelle(),
          ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août',
           'Septembre','Octobre','Novembre','Décembre'][ATTENDU.moisPrecedentNum - 1]
          + ' ' + ATTENDU.moisPrecedentAnnee);
  r.check('▶ réactivée hors du mois courant', await page.evaluate(
    () => document.getElementById('rist-mois-suivant').disabled), false);

  // Le tableau doit réellement suivre.
  const tableau = await page.evaluate(
    () => document.getElementById('rist-mois-table')?.innerText || '');
  r.check('tableau du mois précédent non vide',
          tableau.length > 20 && !/Aucune activité/.test(tableau), true);

  r.section('Le futur reste interdit');
  await page.evaluate(() => decalerSelecteursMois('rist-mois', 'rist-annee', 1, renderRistournesMois));
  await page.waitForTimeout(700);
  r.check('▶ ramène au mois courant', await moisAffiche(), ATTENDU.moisCourantNum);
  await page.evaluate(() => decalerSelecteursMois('rist-mois', 'rist-annee', 1, renderRistournesMois));
  await page.waitForTimeout(700);
  r.check('▶ au-delà est sans effet', await moisAffiche(), ATTENDU.moisCourantNum);

  r.section('Passage d\'année (janvier ◀ → décembre)');
  r.check('bascule décembre/année-1 gérée', await page.evaluate(() => {
    const m = document.getElementById('rist-mois'), a = document.getElementById('rist-annee');
    const sauveM = m.value, sauveA = a.value;
    m.value = '1'; a.value = String(new Date().getFullYear() - 1);
    decalerSelecteursMois('rist-mois', 'rist-annee', -1, () => {});
    const res = m.value + '/' + a.value;
    m.value = sauveM; a.value = sauveA;
    return res;
  }), '12/' + (new Date().getFullYear() - 2));

  // ─────────────── PRESCRIPTEURS ───────────────
  await page.evaluate(() => showView('comptes'));
  await page.waitForTimeout(1800);

  r.section('Prescripteurs — recherche');
  const lignes = () => page.evaluate(() => {
    const t = document.getElementById('prescripteurs-list');
    return t ? t.querySelectorAll('tbody tr').length : -1;
  });
  const compteur = () => page.evaluate(
    () => document.getElementById('presc-count')?.textContent || '');

  r.check('champ de recherche présent', await page.evaluate(
    () => !!document.getElementById('presc-search')), true);
  r.check('liste complète au départ', await lignes(), PRESCRIPTEURS.length);
  r.check('compteur initial', await compteur(), '3 prescripteurs');

  await page.evaluate(() => filtrerPrescripteurs('KOUASSI'));
  await page.waitForTimeout(500);
  r.check('recherche par nom', await lignes(), 1);
  r.check('compteur filtré', await compteur(), '1 sur 3 prescripteurs');

  await page.evaluate(() => filtrerPrescripteurs('pédiatrie'));
  await page.waitForTimeout(500);
  r.check('recherche par spécialité (insensible à la casse)', await lignes(), 1);

  await page.evaluate(() => filtrerPrescripteurs('CPMI'));
  await page.waitForTimeout(500);
  r.check('recherche par structure', await lignes(), 2);

  await page.evaluate(() => filtrerPrescripteurs('ZZZINTROUVABLE'));
  await page.waitForTimeout(500);
  r.check('aucun résultat → message explicite', await page.evaluate(
    () => /Aucun prescripteur ne correspond/.test(
      document.getElementById('prescripteurs-list')?.innerText || '')), true);

  await page.evaluate(() => effacerRecherchePresc());
  await page.waitForTimeout(500);
  r.check('« Effacer » restaure la liste', await lignes(), PRESCRIPTEURS.length);
  r.check('champ vidé', await page.evaluate(
    () => document.getElementById('presc-search')?.value), '');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));

  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

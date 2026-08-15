// Deux mots de passe pour un seul identifiant — v13.105
//
// `admin` a deux mots de passe : le premier ouvre l'application ordinaire,
// le second l'ouvre avec le cahier jaune et les dossiers verrouillés.
//
// ⚠️ CE QUE CE FICHIER NE PROUVE PAS : que la seconde porte protège quoi que
// ce soit. Cela se joue dans la base — `login_user` pose l'élévation sur la
// session, et `coffre_ouvert(token)` conditionne `get_cahier_jaune`,
// `get_resultats_light`, `get_resultat_full` et `get_restriction_status`.
// Un test de navigateur parle à un serveur simulé : il ne peut rien démontrer
// de la sécurité réelle.
//
// Ce qu'il vérifie est l'autre moitié, celle que le serveur ne peut pas
// garantir : qu'en session ordinaire l'écran ne laisse **aucun indice** de
// l'existence de la seconde porte. Un cadenas, un bouton grisé ou une boîte
// qui réclame un code suffiraient à la trahir.
const { serve, openApp, createReporter } = require('./helpers');

const AUJ = new Date().toISOString().slice(0, 10);

// ⚠️ Le cahier jaune n'affiche QUE les jours ouvrés. Une écriture datée d'un
// samedi n'apparaît nulle part, et le contrôle échoue pour une raison qui
// n'a rien à voir avec ce qu'il teste — un jour sur trois, au hasard du
// calendrier. On dérive donc le premier jour ouvré du mois courant, sans
// jamais écrire de date en dur (voir tests/README.md).
const JOUR_OUVRE = (() => {
  const d = new Date();
  d.setDate(1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const FICHES_ORDINAIRES = [
  { id: 1, type: 'Hématologie', montant: 3000, created_at: AUJ + 'T09:00:00Z',
    created_by: 'admin1', prescripteur_id: 1, est_bpn: false,
    restricted_by: null, deleted_at: null,
    patient: { nom: 'VISIBLE ANNE', age: 30, sexe: 'F', dossier: 'D1', date: AUJ,
               statut: 'rendu', paiement_status: 'paye' }, resultats: {} },
];

// Ce que le serveur renvoie à une session élevée : la fiche verrouillée en plus.
const FICHES_ELEVEES = FICHES_ORDINAIRES.concat([
  { id: 2, type: 'Biochimie', montant: 5000, created_at: AUJ + 'T10:00:00Z',
    created_by: 'admin1', prescripteur_id: 1, est_bpn: false,
    restricted_by: 'admin1', deleted_at: null,
    patient: { nom: 'CACHEE SECRETE', age: 40, sexe: 'M', dossier: 'D2', date: AUJ,
               statut: 'rendu', paiement_status: 'paye' }, resultats: {} },
]);

const CAHIER = { mois: JOUR_OUVRE.slice(0, 7),
  colonnes: [{ id: 1, libelle: 'SFPMI', ordre: 10, archivee: false }],
  ecritures: [{ id: 1, jour: JOUR_OUVRE, colonne_id: 1, montant: 10000,
                explication: 'BPN interne', origine: 'bpn_interne' }],
  lecture_seule: false };

const ORDINAIRE = { configure: true, ouvert: false, admin: true };
const ELEVEE    = { configure: true, ouvert: true,  admin: true };
const SANS      = { configure: false, ouvert: true, admin: true };

const admin = rpc => ({ role: 'admin', username: 'admin1', userId: 1, rpc });

(async () => {
  const srv = await serve();
  const r = createReporter('DEUX MOTS DE PASSE, UN IDENTIFIANT');

  // ── 1. Session ordinaire : aucun indice ──────────────────────────
  {
    r.section('Session ordinaire — rien ne trahit la seconde porte');
    const { ctx, page, errors } = await openApp(admin({
      etat_coffre: ORDINAIRE,
      get_resultats_light: FICHES_ORDINAIRES,
      get_restriction_status: [],
      get_cahier_jaune: { erreur: 'coffre_ferme' } }));

    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(800);

    r.check('la fiche ordinaire est là',
            /VISIBLE ANNE/.test(await page.textContent('body')), true);
    r.check('la fiche verrouillée est absente',
            /CACHEE SECRETE/.test(await page.textContent('body')), false);
    // Le cœur du contrôle : le bouton des fiches masquées ne doit pas
    // exister. Sa seule présence dirait qu'il y a quelque chose derrière.
    r.check('aucun bouton « fiches masquées »',
            await page.locator('#btn-masquees:visible').count(), 0);
    r.check('aucune boîte réclamant un code',
            await page.locator('#coffre-modale').count(), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 2. Le cahier jaune n'apparaît pas non plus ───────────────────
  {
    r.section('Session ordinaire — le cahier jaune ne montre rien');
    const { ctx, page, errors } = await openApp(admin({
      etat_coffre: ORDINAIRE,
      get_resultats_light: FICHES_ORDINAIRES,
      get_restriction_status: [],
      get_cahier_jaune: { erreur: 'coffre_ferme' } }));

    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(800);

    const zone = await page.textContent('#cahier-tableau');
    r.check('aucune écriture affichée', /10\s?000/.test(zone), false);
    // Un refus doit s'AFFICHER comme un refus. Sans ce contrôle, une version
    // qui ignorerait la réponse du serveur dessinerait une grille vide et
    // passerait pour saine : le test serait vert pour la mauvaise raison.
    r.check('le refus est dit, pas une grille vide',
            /ne vous est pas ouvert/i.test(zone), true);
    r.check('aucune boîte réclamant un code',
            await page.locator('#coffre-modale').count(), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 3. Session élevée : tout est là ──────────────────────────────
  {
    r.section('Session élevée — dossiers verrouillés et cahier visibles');
    const { ctx, page, errors } = await openApp(admin({
      etat_coffre: ELEVEE,
      get_resultats_light: FICHES_ELEVEES,
      get_restriction_status: [{ id: 2, restricted_by: 'admin1' }],
      get_cahier_jaune: CAHIER }));

    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(900);
    r.check('le bouton des fiches masquées apparaît',
            await page.locator('#btn-masquees:visible').count(), 1);

    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(900);
    r.check('le cahier est affiché',
            /10\s?000/.test(await page.textContent('#cahier-tableau')), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 4. Aucun second mot de passe : rien ne change ────────────────
  {
    r.section('Tant qu\'aucun second mot de passe n\'existe, rien ne change');
    const { ctx, page } = await openApp(admin({
      etat_coffre: SANS,
      get_resultats_light: FICHES_ELEVEES,
      get_restriction_status: [{ id: 2, restricted_by: 'admin1' }],
      get_cahier_jaune: CAHIER }));

    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(800);
    r.check('le cahier s\'ouvre normalement',
            /10\s?000/.test(await page.textContent('#cahier-tableau')), true);
    await ctx.close();
  }

  // ── 5. Le panneau d'administration ───────────────────────────────
  {
    r.section('Administration — l\'état est dit clairement');
    const { ctx, page } = await openApp(admin({ etat_coffre: SANS }));
    await page.evaluate(() => majPanneauCoffre());
    await page.waitForTimeout(500);
    r.check('l\'absence de second mot de passe est signalée',
            /aucun second mot de passe/i.test(await page.textContent('#coffre-etat')), true);

    await page.evaluate(() => { _sb.rpc = async fn =>
      fn === 'etat_coffre'
        ? { data: { configure: true, ouvert: false, admin: true }, error: null }
        : { data: null, error: null }; });
    await page.evaluate(() => majPanneauCoffre());
    await page.waitForTimeout(500);
    r.check('la session ordinaire est signalée',
            /session ordinaire/i.test(await page.textContent('#coffre-etat')), true);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

// Portail du soignant — ce que voit un infirmier ou un médecin du centre.
//
// Le cloisonnement réel est décidé par le serveur : `get_mes_prescriptions`
// ne renvoie que les dossiers dont le `prescripteur_id` correspond au compte,
// et `get_prescription_full` refuse tout le reste. Ces contrôles-là vivent
// dans la base et sont vérifiés par `auditer_securite`.
//
// Ce fichier vérifie ce que le serveur ne peut pas garantir : que la PAGE ne
// demande rien d'autre, n'affiche pas d'argent, et dit clairement quand un
// résultat n'est pas encore validé. C'est important parce que le laboratoire
// a choisi de montrer les valeurs dès la saisie : sans l'avertissement, un
// chiffre provisoire serait recopié dans un dossier comme définitif.
const { serve, openApp, createReporter } = require('./helpers');

const AUJOURD = new Date().toISOString().slice(0, 10);

const MES_FICHES = [
  { id: 101, dossier: '12-0826', nom: 'KOUASSI AYA', age: '28 ans', sexe: 'F',
    date_prelevement: AUJOURD, statut: 'rendu', rendu: true,
    examens: ['Glycémie', 'Créatinine'], created_at: AUJOURD + 'T09:00:00Z' },
  { id: 102, dossier: '13-0826', nom: 'TRAORE MOUSSA', age: '5 ans', sexe: 'M',
    date_prelevement: AUJOURD, statut: 'en cours', rendu: false,
    examens: ['NFS'], created_at: AUJOURD + 'T10:00:00Z' },
];

const DETAIL_RENDU = {
  id: 101, valide: true, statut: 'rendu', type: 'Biochimie',
  types: ['Glycémie', 'Créatinine'],
  patient: { dossier: '12-0826', nom: 'KOUASSI AYA', age: '28 ans', sexe: 'F', date: AUJOURD },
  resultats: { 'Glycémie': '0.95 g/L', 'Créatinine': '9 mg/L' },
};

const DETAIL_EN_COURS = Object.assign({}, DETAIL_RENDU, {
  id: 102, valide: false, statut: 'en cours', types: ['NFS'],
  patient: { dossier: '13-0826', nom: 'TRAORE MOUSSA', age: '5 ans', sexe: 'M', date: AUJOURD },
  resultats: { 'Hémoglobine': '11.2 g/dL' },
});

const soignant = (rpc, extra = {}) => Object.assign({
  role: 'prescripteur', username: 'sf.athe', userId: 42,
  cible: '/soignant.html', rpc,
}, extra);

(async () => {
  const srv = await serve();
  const r = createReporter('PORTAIL DU SOIGNANT');

  // ── 1. La liste de ses patients ──────────────────────────────────
  {
    r.section('Un soignant voit les patients qu\'il a adressés');
    const appels = [];
    const { ctx, page, errors } = await openApp(soignant(
      { get_mes_prescriptions: MES_FICHES }, { appels }));

    const txt = await page.textContent('#liste');
    r.check('son premier patient est listé',  /KOUASSI AYA/.test(txt), true);
    r.check('son second patient est listé',   /TRAORE MOUSSA/.test(txt), true);
    r.check('deux fiches affichées',
            await page.locator('#liste .fiche').count(), 2);
    r.check('le rendu est marqué « Rendu »',
            /Rendu/.test(await page.textContent('#liste .fiche:nth-child(1)')), true);
    r.check('le second est marqué « En cours »',
            /En cours/.test(await page.textContent('#liste .fiche:nth-child(2)')), true);

    // Le cœur du contrôle : la page ne doit demander QUE son propre guichet.
    // Si elle appelait get_resultats_light, elle recevrait tout le registre.
    const interdits = appels.filter(f => f !== 'get_mes_prescriptions'
                                      && f !== 'get_prescription_full'
                                      && f !== 'logout_token');
    r.check('aucun appel au registre du laboratoire',
            interdits.join(', ') || 'aucun', 'aucun');
    r.check('le guichet du soignant a bien été appelé',
            appels.includes('get_mes_prescriptions'), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 2. Un résultat non validé le dit ─────────────────────────────
  {
    r.section('Un résultat non validé est signalé comme tel');
    const { ctx, page, errors } = await openApp(soignant(
      { get_mes_prescriptions: MES_FICHES, get_prescription_full: DETAIL_EN_COURS }));

    await page.click('#liste .fiche:nth-child(2)');
    await page.waitForTimeout(400);
    const corps = await page.textContent('#det-corps');

    r.check('l\'avertissement est affiché', /non validé/i.test(corps), true);
    r.check('il dit que la valeur peut changer', /peuvent encore changer/i.test(corps), true);
    r.check('la valeur reste visible (choix du labo)', /11\.2/.test(corps), true);
    r.check('l\'état est « En cours »',
            (await page.textContent('#det-badge')).trim(), 'En cours');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  {
    r.section('Un résultat rendu n\'affiche PAS l\'avertissement');
    const { ctx, page, errors } = await openApp(soignant(
      { get_mes_prescriptions: MES_FICHES, get_prescription_full: DETAIL_RENDU }));

    await page.click('#liste .fiche:nth-child(1)');
    await page.waitForTimeout(400);
    const corps = await page.textContent('#det-corps');

    r.check('pas d\'avertissement', /non validé/i.test(corps), false);
    r.check('les deux analyses sont là', /Glycémie/.test(corps) && /Créatinine/.test(corps), true);
    r.check('la valeur est affichée', /0\.95/.test(corps), true);
    r.check('l\'état est « Rendu »',
            (await page.textContent('#det-badge')).trim(), 'Rendu');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 3. Rien de comptable ─────────────────────────────────────────
  {
    r.section('Le portail ne montre aucun montant');
    const { ctx, page, errors } = await openApp(soignant(
      { get_mes_prescriptions: MES_FICHES, get_prescription_full: DETAIL_RENDU }));

    await page.click('#liste .fiche:nth-child(1)');
    await page.waitForTimeout(400);
    const tout = await page.textContent('body');

    r.check('aucun « FCFA » à l\'écran', /FCFA/.test(tout), false);
    r.check('aucune mention de caisse', /caisse/i.test(tout), false);
    r.check('aucune mention de ristourne', /ristourne/i.test(tout), false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 4. Le refus du serveur est respecté à l'écran ────────────────
  {
    r.section('Une fiche refusée par le serveur n\'affiche rien');
    const { ctx, page, errors } = await openApp(soignant(
      { get_mes_prescriptions: MES_FICHES,
        get_prescription_full: { erreur: 'introuvable' } }));

    await page.click('#liste .fiche:nth-child(1)');
    await page.waitForTimeout(400);
    const corps = await page.textContent('#det-corps');

    r.check('le refus est dit clairement', /pas accessible/i.test(corps), true);
    r.check('aucune valeur inventée', /0\.95|11\.2/.test(corps), false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 5. Cloisonnement des rôles côté page ─────────────────────────
  {
    r.section('Le portail n\'est pas une porte dérobée vers le laboratoire');
    const { ctx, page } = await openApp({
      role: 'agent', username: 'agent1', userId: 7, cible: '/soignant.html',
      rpc: { get_mes_prescriptions: MES_FICHES } });
    await page.waitForTimeout(700);
    r.check('un agent est renvoyé hors du portail',
            /soignant\.html/.test(page.url()), false);
    await ctx.close();
  }

  {
    r.section('Sans session, on retourne à la page de connexion');
    const { ctx, page } = await openApp({
      cible: '/soignant.html', sansSession: true, rpc: {} });
    await page.waitForTimeout(700);
    r.check('redirigé vers login', /login\.html/.test(page.url()), true);
    await ctx.close();
  }

  // ── 6. La connexion mène au bon endroit ──────────────────────────
  {
    r.section('Un soignant qui se connecte arrive sur SON portail');
    const { ctx, page } = await openApp(soignant(
      { get_mes_prescriptions: MES_FICHES }, { cible: '/login.html' }));
    await page.waitForTimeout(900);
    r.check('login renvoie vers le portail', /soignant\.html/.test(page.url()), true);
    await ctx.close();
  }

  // ── 7. Recherche ─────────────────────────────────────────────────
  {
    r.section('La recherche filtre la liste');
    const { ctx, page, errors } = await openApp(soignant(
      { get_mes_prescriptions: MES_FICHES }));

    await page.fill('#recherche', 'traore');
    await page.waitForTimeout(250);
    r.check('une seule fiche reste', await page.locator('#liste .fiche').count(), 1);

    await page.fill('#recherche', '');
    await page.selectOption('#filtre-statut', 'rendu');
    await page.waitForTimeout(250);
    r.check('filtre « rendu » : une fiche', await page.locator('#liste .fiche').count(), 1);
    r.check('c\'est bien la bonne',
            /KOUASSI/.test(await page.textContent('#liste')), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

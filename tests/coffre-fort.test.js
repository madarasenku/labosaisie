// Le coffre-fort — v13.104
//
// Un second secret, distinct du mot de passe, exigé pour ouvrir le cahier
// jaune et pour révéler les dossiers verrouillés.
//
// ⚠️ CE QUE CE FICHIER NE PROUVE PAS : que le coffre protège quoi que ce
// soit. La protection vit dans la base — `coffre_ouvert(token)` conditionne
// `get_cahier_jaune`, `get_resultats_light`, `get_resultat_full` et
// `get_restriction_status`, et c'est `auditer_securite` qui le vérifie sur
// le serveur réel. Un test de navigateur ne peut pas le démontrer : il
// parle à un serveur simulé qui répond ce qu'on lui dit de répondre.
//
// Ce qui est vérifié ici est ce que le serveur ne peut pas garantir : que
// l'écran DEMANDE le code, qu'il n'invente rien quand le serveur refuse, et
// surtout qu'il ne prétend jamais avoir ouvert le coffre tout seul.
const { serve, openApp, createReporter } = require('./helpers');

const FERME    = { configure: true,  ouvert: false, admin: true, bloque: false };
const OUVERT   = { configure: true,  ouvert: true,  admin: true, bloque: false };
const ABSENT   = { configure: false, ouvert: true,  admin: true, bloque: false };
const CAHIER   = { mois: '2026-08', colonnes: [{ id: 1, libelle: 'SFPMI', ordre: 10, archivee: false }],
                   ecritures: [{ id: 1, jour: '2026-08-11', colonne_id: 1, montant: 10000,
                                 explication: 'BPN interne — ESSAI', origine: 'bpn_interne' }],
                   lecture_seule: false };

const admin = (rpc, extra = {}) => Object.assign(
  { role: 'admin', username: 'admin1', userId: 1, rpc }, extra);

(async () => {
  const srv = await serve();
  const r = createReporter('COFFRE-FORT');

  // ── 1. Coffre fermé : le cahier réclame le code ──────────────────
  {
    r.section('Coffre fermé — le cahier jaune demande le code');
    const appels = [];
    const { ctx, page, errors } = await openApp(admin(
      { etat_coffre: FERME, get_cahier_jaune: { erreur: 'coffre_ferme' } }, { appels }));

    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(700);

    r.check('la boîte du coffre s\'ouvre',
            await page.locator('#coffre-modale').count(), 1);
    r.check('elle explique pourquoi',
            /cahier jaune est protégé/i.test(await page.textContent('#coffre-modale')), true);
    // Tant que le code n'est pas donné, RIEN ne doit avoir été demandé au
    // cahier : c'est la différence entre garder une porte et la repeindre.
    r.check('aucune écriture affichée',
            /10\s?000/.test(await page.textContent('#cahier-tableau')), false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 2. Un code refusé ne donne rien ──────────────────────────────
  {
    r.section('Un code refusé par le serveur ne donne rien');
    const { ctx, page, errors } = await openApp(admin(
      { etat_coffre: FERME, ouvrir_coffre: { erreur: 'code_incorrect' },
        get_cahier_jaune: { erreur: 'coffre_ferme' } }));

    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(600);
    await page.fill('#coffre-code', 'mauvais');
    await page.click('#coffre-ok');
    await page.waitForTimeout(500);

    r.check('la boîte reste ouverte', await page.locator('#coffre-modale').count(), 1);
    r.check('le refus est dit',
            /incorrect/i.test(await page.textContent('#coffre-err')), true);
    r.check('le champ est vidé',
            await page.inputValue('#coffre-code'), '');
    r.check('aucune écriture affichée',
            /10\s?000/.test(await page.textContent('#cahier-tableau')), false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 3. Blocage après trop d'essais ───────────────────────────────
  {
    r.section('Le blocage du serveur est relayé à l\'écran');
    const { ctx, page } = await openApp(admin(
      { etat_coffre: FERME, ouvrir_coffre: { erreur: 'bloque', secondes: 900 },
        get_cahier_jaune: { erreur: 'coffre_ferme' } }));

    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(600);
    await page.fill('#coffre-code', 'x');
    await page.click('#coffre-ok');
    await page.waitForTimeout(400);

    const msg = await page.textContent('#coffre-err');
    r.check('le blocage est annoncé', /trop d'essais/i.test(msg), true);
    r.check('avec le délai', /15\s*min/i.test(msg), true);
    await ctx.close();
  }

  // ── 4. Le bon code ouvre, et le cahier arrive ────────────────────
  {
    r.section('Le bon code ouvre le cahier');
    const { ctx, page, errors } = await openApp(admin(
      { etat_coffre: FERME, ouvrir_coffre: { ok: true }, get_cahier_jaune: CAHIER }));

    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(600);
    await page.fill('#coffre-code', 'le-bon-code');
    await page.click('#coffre-ok');
    await page.waitForTimeout(900);

    r.check('la boîte se ferme', await page.locator('#coffre-modale').count(), 0);
    r.check('le cahier est affiché',
            /10\s?000/.test(await page.textContent('#cahier-tableau')), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 5. Coffre déjà ouvert : on ne redemande rien ─────────────────
  {
    r.section('Coffre déjà ouvert — aucune question inutile');
    const { ctx, page } = await openApp(admin(
      { etat_coffre: OUVERT, get_cahier_jaune: CAHIER }));
    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(700);
    r.check('aucune boîte affichée', await page.locator('#coffre-modale').count(), 0);
    r.check('le cahier est là',
            /10\s?000/.test(await page.textContent('#cahier-tableau')), true);
    await ctx.close();
  }

  // ── 6. Aucun code défini : rien ne change ────────────────────────
  // C'est ce qui empêche la pose du garde-fou d'enfermer l'administrateur
  // dehors avant qu'il ait pu choisir son code.
  {
    r.section('Tant qu\'aucun code n\'existe, rien ne change');
    const { ctx, page } = await openApp(admin(
      { etat_coffre: ABSENT, get_cahier_jaune: CAHIER }));
    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(700);
    r.check('aucune boîte affichée', await page.locator('#coffre-modale').count(), 0);
    r.check('le cahier s\'ouvre normalement',
            /10\s?000/.test(await page.textContent('#cahier-tableau')), true);
    await ctx.close();
  }

  // ── 7. Les dossiers verrouillés passent par le même code ─────────
  {
    r.section('Révéler les dossiers verrouillés demande le code');
    const { ctx, page } = await openApp(admin(
      { etat_coffre: FERME, get_restriction_status: [] }));

    await page.evaluate(() => showView('historique'));
    // Le bouton n'apparaît que si l'état du coffre est connu : c'est
    // précisément ce qui manquait et qui rendait la porte invisible.
    await page.evaluate(async () => { await etatCoffre(); updateMasqueesBtn(); });
    await page.waitForTimeout(600);
    // On clique le VRAI bouton plutôt que d'appeler la fonction : celle-ci
    // reste suspendue tant que la boîte n'a pas répondu, et l'attendre
    // depuis le test bloquerait le test pour toujours.
    await page.click('#btn-masquees');
    await page.waitForTimeout(600);
    r.check('la boîte s\'ouvre', await page.locator('#coffre-modale').count(), 1);
    r.check('elle parle des dossiers verrouillés',
            /dossiers verrouillés/i.test(await page.textContent('#coffre-modale')), true);

    // Annuler ne doit PAS basculer la vue : sinon l'écran prétendrait
    // montrer les verrouillés alors qu'il n'a rien obtenu.
    await page.click('#coffre-annuler');
    await page.waitForTimeout(400);
    r.check('annuler ne bascule pas la vue',
            await page.evaluate(() => _filterVerrouillees), false);
    await ctx.close();
  }

  // ── 8. Le panneau d'administration dit l'état ────────────────────
  {
    r.section('Administration — l\'état du coffre est affiché');
    const { ctx, page } = await openApp(admin({ etat_coffre: ABSENT }));
    await page.evaluate(() => majPanneauCoffre());
    await page.waitForTimeout(400);
    r.check('l\'absence de code est signalée',
            /aucun code défini/i.test(await page.textContent('#coffre-etat')), true);

    await page.evaluate(() => { _sb.rpc = async (fn) =>
      fn === 'etat_coffre' ? { data: { configure: true, ouvert: false, admin: true }, error: null }
                           : { data: null, error: null }; });
    await page.evaluate(() => majPanneauCoffre());
    await page.waitForTimeout(400);
    r.check('le coffre fermé est signalé',
            /coffre fermé/i.test(await page.textContent('#coffre-etat')), true);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

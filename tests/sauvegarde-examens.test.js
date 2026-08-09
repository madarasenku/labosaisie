// Sauvegarde de la base et examens personnalisés partagés (v13.77).
//
// Deux sujets, une même leçon : ce qui vit dans le localStorage d'un poste
// n'existe pas pour les autres. Les examens ajoutés par l'admin étaient dans
// ce cas — pire que les tarifs, car ce n'était pas un prix faux mais un
// examen absent du formulaire.
//
// La sauvegarde, elle, ne doit JAMAIS quitter le poste de l'admin : le dépôt
// GitHub du projet est public.
const { serve, openApp, createReporter } = require('./helpers');

const EXAMENS_BASE = [
  { id:'custom_1', label:'Test COVID antigénique', groupe:'💉 Immuno-Sérologie',
    prix:5000, tab:'sero', custom:true },
];

(async () => {
  const srv = await serve();
  const r = createReporter('SAUVEGARDE & EXAMENS PERSONNALISÉS');

  // ── Les examens de la base doivent arriver sur tous les postes ──
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_examens_custom: EXAMENS_BASE, get_tarifs: {} },
    });
    r.section('Examens personnalisés chargés depuis la base');
    // Le chargement est déclenché automatiquement à l'ouverture de session
    // (enterApp) : c'est précisément ce qui fait qu'un examen ajouté depuis
    // un autre poste apparaît ici sans aucune manipulation.
    r.check('chargé automatiquement à la connexion', await page.evaluate(
      () => getExamensCustom().length), 1);

    await page.evaluate(() => chargerExamensCustomDepuisBase());
    await page.waitForTimeout(800);
    r.check('récupérés depuis la base', await page.evaluate(
      () => getExamensCustom().length), 1);
    r.check('libellé correct', await page.evaluate(
      () => getExamensCustom()[0].label), 'Test COVID antigénique');
    r.check('présent dans le catalogue complet', await page.evaluate(
      () => getCatalogueComplet().some(e => e.id === 'custom_1')), true);
    r.check('mis en cache local', await page.evaluate(
      () => JSON.parse(localStorage.getItem('examens_custom') || '[]').length), 1);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Un agent ne peut pas modifier le catalogue ──
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_examens_custom: [], save_examens_custom: 'forbidden', get_tarifs: {} },
    });
    r.section('Seul un administrateur modifie le catalogue');
    const message = await page.evaluate(async () => {
      let capté = '';
      const vrai = window.toast;
      window.toast = m => { capté = m; };
      await saveExamensCustom([{ id:'x', label:'X', prix:1 }]);
      window.toast = vrai;
      return capté;
    });
    r.check('refus signalé', /administrateur/i.test(message), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Sauvegarde : contenu, confidentialité, traçabilité ──
  {
    const FICHES = [
      { id:1, type:'Dossier', patient:{ nom:'KOUAME AYA' }, resultats:{ 'Hb':'12' }, montant:3000 },
      { id:2, type:'Dossier', patient:{ nom:'BAMBA SALIF' }, resultats:{ 'Hb':'14' }, montant:3500 },
    ];
    const { ctx, page, errors } = await openApp({
      role: 'admin',
      rpc: { get_resultats: FICHES, get_tarifs: {}, get_examens_custom: [],
             enregistrer_sauvegarde: 'ok',
             derniere_sauvegarde: { jamais: true, fiches_actuelles: 2 } },
    });
    r.section('Sauvegarde complète');

    // On intercepte le téléchargement pour inspecter le contenu produit.
    const paquet = await page.evaluate(async () => {
      let contenu = null;
      const vraiCreate = URL.createObjectURL;
      URL.createObjectURL = (blob) => { contenu = blob; return 'blob:faux'; };
      const vraiClick = HTMLAnchorElement.prototype.click;
      let nomFichier = '';
      HTMLAnchorElement.prototype.click = function () { nomFichier = this.download; };
      await sauvegarderBase();
      URL.createObjectURL = vraiCreate;
      HTMLAnchorElement.prototype.click = vraiClick;
      const texte = contenu ? await contenu.text() : '';
      return { nomFichier, texte };
    });

    r.check('un fichier est proposé au téléchargement',
            /^labosaisie-sauvegarde-\d{8}-\d{4}\.json$/.test(paquet.nomFichier), true);

    let json = null;
    try { json = JSON.parse(paquet.texte); } catch (e) { /* laissé à null */ }
    r.check('contenu JSON valide', !!json, true);
    r.check('les fiches sont incluses', json && json.fiches.length, 2);
    r.check('les résultats détaillés aussi',
            json && json.fiches[0].resultats && json.fiches[0].resultats.Hb, '12');
    r.check('la grille tarifaire est incluse', json && typeof json.tarifs, 'object');
    r.check('les prescripteurs aussi', json && Array.isArray(json.prescripteurs), true);
    r.check('nombre de fiches en en-tête', json && json._meta.nb_fiches, 2);
    r.check('auteur de l\'export', json && json._meta.exporte_par, 'admin1');
    // Le fichier contient des données nominatives : l'avertissement doit être
    // dans le fichier lui-même, pas seulement dans l'interface.
    r.check('avertissement de confidentialité présent',
            !!(json && /données médicales nominatives/i.test(json._meta.avertissement)), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Un agent ne peut pas sauvegarder ──
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Sauvegarde réservée aux administrateurs');
    const res = await page.evaluate(async () => {
      let capté = '', telecharge = false;
      const vrai = window.toast; window.toast = m => { capté = m; };
      const vraiClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { telecharge = true; };
      await sauvegarderBase();
      window.toast = vrai; HTMLAnchorElement.prototype.click = vraiClick;
      return { capté, telecharge };
    });
    r.check('refus signalé', /administrateur/i.test(res.capté), true);
    r.check('aucun fichier produit', res.telecharge, false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Bandeau d'état de la sauvegarde ──
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [],
        derniere_sauvegarde: { jamais:false, le:'2026-08-01T10:00:00Z', par:'admin',
                               nb_fiches:600, jours:12, fiches_actuelles:629 } },
    });
    r.section('Alerte quand la sauvegarde date');
    await page.evaluate(() => majBandeauSauvegarde());
    await page.waitForTimeout(700);
    const txt = await page.evaluate(
      () => document.getElementById('sauvegarde-etat')?.textContent || '');
    r.check('ancienneté affichée', /12 jours/.test(txt), true);
    r.check('alerte visible au-delà du seuil', /⚠/.test(txt), true);
    r.check('fiches ajoutées depuis signalées', /29 fiches depuis/.test(txt), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

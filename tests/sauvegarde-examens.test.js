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
      () => JSON.parse(localStorage.getItem('examens_custom')
                    || localStorage.getItem('v2_examens_custom') || '[]').length), 1);
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

  // ── Restauration (v13.78) ──────────────────────────────────────────
  //
  // Une sauvegarde qu'on ne sait pas relire n'est pas une sauvegarde. Ces
  // contrôles vérifient l'aller-retour complet et, surtout, les garde-fous :
  // rien ne doit partir au serveur sans confirmation, et jamais depuis un
  // fichier qui n'est pas une sauvegarde LaboSaisie.

  // Remplace _sb.rpc par un espion qui enregistre les appels. On pilote
  // ainsi précisément ce que « la base » contient au moment de l'import.
  const espionner = (page, reponses) => page.evaluate((rep) => {
    window.__appels = [];
    _sb.rpc = async (nom, params) => {
      window.__appels.push({ nom, params });
      return { data: (nom in rep) ? rep[nom] : [], error: null };
    };
    window.showConfirmModal = async () => true;   // confirmation acceptée
  }, reponses);

  const FICHIER = (fiches) => JSON.stringify({
    _meta: { application: 'LaboSaisie CPMI Grand-Bassam', exporte_le: '2026-08-01T10:00:00Z',
             exporte_par: 'admin1', nb_fiches: fiches.length },
    fiches, prescripteurs: [{ id: 7, nom: 'Dr GAMMA', actif: true }],
    tarifs: { ex_nfs: 111 }, examens_personnalises: [],
  });

  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Aller-retour : ce qui est exporté est réinséré');

    // La base est vide : les 3 fiches du fichier doivent toutes repartir.
    await espionner(page, { get_resultats: [], restaurer_fiches: { restaurees: 3, ignorees: 0, sans_prescripteur: 0 },
                            restaurer_prescripteurs: { restaures: 1 } });
    const trois = [
      { id: 1, type: 'Dossier', patient: { nom: 'KOUAME AYA' }, resultats: { Hb: '12' }, montant: 3000 },
      { id: 2, type: 'Dossier', patient: { nom: 'BAMBA SALIF' }, resultats: { Hb: '14' }, montant: 3500 },
      { id: 3, type: 'Dossier', patient: { nom: 'YAO KOFFI' },  resultats: { Hb: '11' }, montant: 4000 },
    ];
    await page.evaluate(t => restaurerBase(t), FICHIER(trois));
    await page.waitForTimeout(900);

    const appels = await page.evaluate(() => window.__appels);
    const envoi  = appels.filter(a => a.nom === 'restaurer_fiches');
    r.check('un envoi de fiches', envoi.length, 1);
    r.check('les 3 fiches sont envoyées', envoi[0] && envoi[0].params.p_fiches.length, 3);
    r.check('les résultats détaillés voyagent',
            envoi[0] && envoi[0].params.p_fiches[0].resultats.Hb, '12');
    // Les prescripteurs d'abord : sinon la clé étrangère efface le lien et
    // la ristourne du médecin est perdue.
    const iP = appels.findIndex(a => a.nom === 'restaurer_prescripteurs');
    const iF = appels.findIndex(a => a.nom === 'restaurer_fiches');
    r.check('prescripteurs restaurés avant les fiches', iP >= 0 && iP < iF, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Ce qui est déjà en base n\'est jamais réécrit');

    // Les fiches 1 et 2 existent déjà ; seule la 3 est absente.
    await espionner(page, { get_resultats: [{ id: 1 }, { id: 2 }],
                            restaurer_fiches: { restaurees: 1, ignorees: 0, sans_prescripteur: 0 },
                            restaurer_prescripteurs: { restaures: 0 } });
    await page.evaluate(t => restaurerBase(t), FICHIER([
      { id: 1, type: 'Dossier', patient: {}, resultats: {} },
      { id: 2, type: 'Dossier', patient: {}, resultats: {} },
      { id: 3, type: 'Dossier', patient: {}, resultats: {} },
    ]));
    await page.waitForTimeout(900);
    const envoi = await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'restaurer_fiches'));
    r.check('seule la fiche absente est envoyée', envoi[0] && envoi[0].params.p_fiches.length, 1);
    r.check('c\'est bien la bonne', envoi[0] && envoi[0].params.p_fiches[0].id, 3);

    // Relancée sur une base complète : plus rien ne doit partir.
    await espionner(page, { get_resultats: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    await page.evaluate(t => restaurerBase(t), FICHIER([
      { id: 1, type: 'Dossier' }, { id: 2, type: 'Dossier' }, { id: 3, type: 'Dossier' },
    ]));
    await page.waitForTimeout(700);
    r.check('rien à restaurer → aucun envoi', await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'restaurer_fiches').length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Découpage en lots et refus des fichiers douteux');

    // 120 fiches : un envoi unique noierait une connexion de labo.
    const beaucoup = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, type: 'Dossier' }));
    await espionner(page, { get_resultats: [],
                            restaurer_fiches: { restaurees: 50, ignorees: 0, sans_prescripteur: 0 },
                            restaurer_prescripteurs: { restaures: 0 } });
    await page.evaluate(t => restaurerBase(t), FICHIER(beaucoup));
    await page.waitForTimeout(1500);
    const lots = await page.evaluate(
      () => window.__appels.filter(a => a.nom === 'restaurer_fiches'));
    r.check('120 fiches → 3 lots', lots.length, 3);
    r.check('aucun lot au-delà de la limite',
            lots.every(l => l.params.p_fiches.length <= 50), true);
    r.check('total conservé',
            lots.reduce((t, l) => t + l.params.p_fiches.length, 0), 120);

    // Un fichier qui n'est pas une sauvegarde doit être rejeté AVANT le
    // moindre appel réseau. On compte donc TOUS les appels, pas seulement
    // les écritures : une première version de ce contrôle ne regardait que
    // `restaurer_fiches` et restait verte même en supprimant la validation,
    // parce que le code partait ensuite en erreur de son côté.
    for (const [libelle, contenu, attendu] of [
      ['texte quelconque',       'ceci n\'est pas du JSON',                              /JSON valide/i],
      ['JSON sans en-tête',      '{"fiches":[{"id":1}]}',                                /pas une sauvegarde LaboSaisie/i],
      ['sauvegarde sans fiches', '{"_meta":{"application":"LaboSaisie CPMI Grand-Bassam"}}', /incomplète/i],
    ]) {
      await espionner(page, { get_resultats: [] });
      const msg = await page.evaluate(async (c) => {
        let capté = ''; const vrai = window.toast; window.toast = m => { capté = m; };
        await restaurerBase(c);
        window.toast = vrai; return capté;
      }, contenu);
      const appelsTotal = await page.evaluate(() => window.__appels.length);
      r.check('refusé : ' + libelle, attendu.test(msg) && appelsTotal === 0, true);
      if (!attendu.test(msg)) console.log('     message obtenu :', JSON.stringify(msg),
                                          '— appels :', appelsTotal);
    }
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Rien ne part sans confirmation explicite');
    await page.evaluate(() => {
      window.__appels = [];
      _sb.rpc = async (nom, params) => {
        window.__appels.push({ nom, params });
        return { data: nom === 'get_resultats' ? [] : {}, error: null };
      };
      window.showConfirmModal = async () => false;   // l'admin annule
    });
    await page.evaluate(t => restaurerBase(t), FICHIER([{ id: 1, type: 'Dossier' }]));
    await page.waitForTimeout(700);
    r.check('annulation → aucune écriture', await page.evaluate(
      () => window.__appels.filter(a => a.nom.startsWith('restaurer_')).length), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, get_examens_custom: [] },
    });
    r.section('Restauration réservée aux administrateurs');
    const res = await page.evaluate(async (t) => {
      window.__appels = [];
      _sb.rpc = async (nom, params) => { window.__appels.push({ nom, params }); return { data: [], error: null }; };
      window.showConfirmModal = async () => true;
      const vrai = window.toast;
      // Les deux portes d'entrée sont testées séparément : sinon le refus du
      // bouton masquerait un appel direct à restaurerBase resté ouvert.
      let parImport = ''; window.toast = m => { parImport = m; };
      await restaurerBase(t);
      let parBouton = ''; window.toast = m => { parBouton = m; };
      choisirFichierRestauration();
      window.toast = vrai;
      return { parImport, parBouton, appels: window.__appels.length };
    }, FICHIER([{ id: 1, type: 'Dossier' }]));
    r.check('refus signalé à l\'import', /administrateur/i.test(res.parImport), true);
    r.check('refus signalé sur le bouton', /administrateur/i.test(res.parBouton), true);
    r.check('aucun appel au serveur', res.appels, 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();

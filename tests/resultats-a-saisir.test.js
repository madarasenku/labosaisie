//
// ════════════════════════════════════════════════════════════════════
//  resultats-a-saisir — BPN, électrophorèses et examens sous-traités dans UN
//  seul écran, ouvert depuis l'Historique, toutes dates, sans changer d'onglet.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const CIBLE = process.env.CIBLE || '/index.html';
const p = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
const il = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d; };

const NFS = 'NFS — Numération Formule Sanguine';
const EPHB = 'Électrophorèse de l\'hémoglobine';
const dossier = (id, jours, coches, extra = {}) => {
  const d = il(jours);
  return {
    id, type: 'Dossier', montant: 5000, created_at: d.toISOString(), created_by: 'YERIGUE',
    patient: { nom: 'P' + id, dossier: 'D' + id, date: ymd(d), sexe: 'F', age: 30, statut: 'attente' },
    resultats: Object.assign({ _types: Object.keys(coches), _examens_coches: coches }, extra.resultats || {}),
    prescripteur_id: 1, est_bpn: !!extra.bpn, restricted_by: null, deleted_at: null,
  };
};
const BPN_COCHES = { 'Hématologie': [NFS, EPHB], 'Biochimie': ['Glycémie à jeun'],
  'Immuno-Sérologie': ['Ag HBs (Hépatite B)'], 'Groupe sanguin': ['Groupe sanguin ABO / Rhésus'] };

const A = dossier(901, 20, BPN_COCHES, { bpn: true });                                   // BPN à saisir (il y a 20 j)
const B = dossier(902, 3, { 'Hématologie': [EPHB] });                                    // électrophorèse seule
const C = dossier(903, 0, { 'Immuno-Sérologie': ['TSH'], 'Biochimie': ['Vitamine D (25-OH)'] }); // sous-traités
const D = dossier(904, 0, { 'Hématologie': [NFS] });                                     // non concerné
const E = dossier(905, 10, BPN_COCHES, { bpn: true,                                      // BPN déjà saisi
  resultats: { _saisi_serie: { nfs: true, ephb: true, gly: true, hbs: true, gs: true } } });
const F = dossier(906, 5, { 'Bactériologie': ['ECBU'] });                                // culture à saisir
const G = dossier(907, 6, { 'Bactériologie': ['ECBU'] });                                // culture déjà saisie
// Le détail complet (get_resultat_full) : G a ses résultats de culture, F non.
const COMPLETS = { 907: { 'Bactériologie': { 'Aspect': 'Clair', 'Coloration de Gram': 'BGN' } } };
const H = dossier(908, 4, { 'Parasitologie': ['EPS — Examen parasitologique des selles'] });  // parasitologie des selles (hors grille, non sous-traité)
const TOUS = [A, B, C, D, E, F, G, H];

(async () => {
  const srv = await serve(8261);
  const r = createReporter('RÉSULTATS À SAISIR — BPN, ÉLECTRO, SOUS-TRAITÉS');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'YERIGUE', userId: 10, cible: CIBLE, port: 8261 });
  await page.waitForTimeout(1500);

  await page.evaluate(([data, completes]) => {
    window.__u = []; window.showConfirmModal = async () => true;
    window.__fa = null; window.fillAllResults = async id => { window.__fa = id; };
    _sb.rpc = async (nom, params) => {
      if (nom === 'get_resultats_light') {
        // Comme le serveur : la liste légère ne garde que les clés « _ ».
        return { data: data.map(d => Object.assign({}, d, { resultats: Object.fromEntries(Object.entries(d.resultats).filter(([k]) => k.charAt(0) === '_')) })), error: null };
      }
      if (nom === 'get_resultat_full') {
        const x = data.find(z => z.id === params.p_id);
        return { data: [{ resultats: Object.assign({}, x ? x.resultats : {}, completes[params.p_id] || {}) }], error: null };
      }
      if (nom === 'update_resultat') {
        window.__u.push(params);
        return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'YERIGUE', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null };
      }
      return { data: [], error: null };
    };
  }, [TOUS, COMPLETS]);
  await page.evaluate(() => refreshDB(true));
  await page.evaluate(() => { showView('historique'); });
  await page.waitForTimeout(500);
  await page.evaluate(() => renderHistory());
  await page.waitForTimeout(500);

  // ── Le bouton, dans l'Historique ────────────────────────────────────
  r.section('Bouton « Résultats à saisir » dans l\'Historique');
  const btn = await page.evaluate(() => {
    const b = document.getElementById('btn-a-saisir'); const bd = document.getElementById('a-saisir-badge');
    return { visible: !!b && b.offsetParent !== null, badge: bd ? bd.textContent : '' };
  });
  r.check('bouton visible pour l\'agent', btn.visible, true);
  // Tout par la série : BPN, électro, sous-traités + culture (906) et selles (908) ;
  // la culture déjà saisie avec l'ancien formulaire (907) est reconnue et exclue.
  r.check('pastille = dossiers à saisir (BPN, électro, sous-traités, culture, selles)', btn.badge, '5');

  // ── Ouverture : toutes dates, sans rien régler ──────────────────────
  r.section('Ouverture depuis l\'Historique');
  await page.evaluate(() => ouvrirResultatsASaisir());
  await page.waitForTimeout(900);

  // ── Par semaine ─────────────────────────────────────────────────────
  r.section('Par semaine (lundi → dimanche)');
  const lundiDe = n => { const d = il(n); const j = d.getDay(); d.setDate(d.getDate() - (j === 0 ? 6 : j - 1)); return ymd(d); };
  const lundiCourant = lundiDe(0);
  const semaineDe = dos => lundiDe(Math.round((new Date() - new Date(dos.created_at)) / 864e5));
  const AFAIRE = [A, B, C, F, H];
  const attendus = (lundi) => AFAIRE.filter(x => semaineDe(x) === lundi).map(x => x.id).sort((a, b) => a - b);
  const avantAttendu = AFAIRE.filter(x => semaineDe(x) < lundiCourant).length;
  const sem = await page.evaluate(() => ({
    toutes: _grilleToutesSemaines,
    label: (document.getElementById('grille-semaine-label') || {}).innerText || '',
    lignes: [...document.querySelectorAll('#grille-serie tr[data-doss]')].map(tr => Number(tr.dataset.doss)).sort((a, b) => a - b),
    avant: grilleEnAttenteAvant(),
    rappel: !!document.getElementById('grille-avant'),
  }));
  r.check('ouvre sur la semaine en cours', sem.toutes, false);
  r.check('libellé « Semaine du lundi … au dimanche … »', /Semaine du lundi .+ au dimanche /.test(sem.label), true);
  r.check('seulement les dossiers de la semaine', JSON.stringify(sem.lignes), JSON.stringify(attendus(lundiCourant)));
  r.check('compte des dossiers en attente des semaines précédentes', sem.avant, avantAttendu);
  r.check('rappel affiché s\'il y en a', sem.rappel, avantAttendu > 0);
  const prec = await page.evaluate(() => { grilleSemaineDecaler(-1); return [...document.querySelectorAll('#grille-serie tr[data-doss]')].map(tr => Number(tr.dataset.doss)).sort((a, b) => a - b); });
  const lundiPrec = (() => { const d = new Date(lundiCourant + 'T12:00:00'); d.setDate(d.getDate() - 7); return ymd(d); })();
  r.check('◀ semaine précédente : ses dossiers', JSON.stringify(prec), JSON.stringify(attendus(lundiPrec)));
  const retourSem = await page.evaluate(() => { grilleSemaineCourante(); return _grilleBornesSemaine().du; });
  r.check('« Cette semaine » revient au lundi courant', retourSem, lundiCourant);
  const badgeTout = await page.evaluate(() => grilleCompteASaisir());
  r.check('la pastille de l\'Historique compte toujours TOUTES les semaines', badgeTout, 5);
  await page.evaluate(() => grilleToggleToutesSemaines(true));
  await page.waitForTimeout(900);

  const ouv = await page.evaluate(() => ({
    mode: _grilleModeASaisir, date: _grilleDate,
    titre: document.querySelector('#grille-serie')?.innerText.includes('Résultats à saisir'),
    lignes: [...document.querySelectorAll('#grille-serie tr[data-doss]')].map(tr => Number(tr.dataset.doss)).sort((a, b) => a - b),
    chips: [...document.querySelectorAll('#grille-chips button')].map(b => b.dataset.cat + ':' + b.innerText.replace(/\D+/g, '')),
  }));
  r.check('mode « à saisir » actif', ouv.mode, true);
  r.check('toutes les dates (aucun filtre date)', ouv.date, '');
  r.check('titre « Résultats à saisir »', ouv.titre, true);
  r.check('dossiers : BPN (il y a 20 j), électro, sous-traités, culture, selles', JSON.stringify(ouv.lignes), '[901,902,903,906,908]');
  r.check('NFS seule (904) et BPN déjà saisi (905) exclus', ouv.lignes.includes(904) || ouv.lignes.includes(905), false);
  r.check('pastilles : tout/BPN/électro/sous-traités', ouv.chips.join(' '), ':5 bpn:1 electro:2 st:2');
  r.check('culture déjà saisie hors série (907) exclue', ouv.lignes.includes(907), false);

  // ── Cultures et selles : dans la série (fenêtre « Saisir ») ─────────
  r.section('Cultures et selles dans la série');
  const fiches = await page.evaluate(() => ({
    bact: !!document.getElementById('gbtn_906_bact'),
    eps: !!document.getElementById('gbtn_908_eps'),
    blocAncien: !!document.getElementById('grille-hors'),
  }));
  r.check('culture (906) : case « Saisir » dans sa ligne', fiches.bact, true);
  r.check('selles (908) : case « Saisir » dans sa ligne', fiches.eps, true);
  r.check('plus de bloc « formulaire complet »', fiches.blocAncien, false);

  // ── Catégories ──────────────────────────────────────────────────────
  r.section('Pastilles de catégorie');
  const cat = async c => page.evaluate(k => {
    grilleSetCategorie(k);
    return {
      lignes: [...document.querySelectorAll('#grille-serie tr[data-doss]')].map(tr => Number(tr.dataset.doss)).sort((a, b) => a - b),
      cols: [...new Set([...document.querySelectorAll('#grille-serie thead th.gr-h1')].map(th => th.dataset.exam))],
    };
  }, c);
  const bpn = await cat('bpn');
  r.check('BPN : la patiente BPN seulement', JSON.stringify(bpn.lignes), '[901]');
  r.check('BPN : tous ses composants côte à côte', ['nfs', 'ephb', 'gly', 'hbs', 'gs'].every(k => bpn.cols.includes(k)), true);
  r.check('BPN : pas de colonne TSH', bpn.cols.some(k => /tsh/.test(k)), false);
  const el = await cat('electro');
  r.check('Électrophorèse : BPN + dossier seul', JSON.stringify(el.lignes), '[901,902]');
  r.check('Électrophorèse : une seule colonne (ephb)', JSON.stringify(el.cols), '["ephb"]');
  const st = await cat('st');
  r.check('Sous-traités : TSH / vitamine D + la culture (pas l\'EPS, non sous-traité)', JSON.stringify(st.lignes), '[903,906]');
  r.check('Sous-traités : colonnes TSH, vitamine D et bactériologie', st.cols.sort().join(','), 'auto_tsh,auto_vitd,bact');

  // ── Saisie et enregistrement ────────────────────────────────────────
  r.section('Saisir un résultat sous-traité et enregistrer');
  await page.evaluate(() => {
    const el = document.getElementById('g_903_auto_tsh_tsh'); el.value = '2.4';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const coche = await page.evaluate(() => document.getElementById('gsel_903').checked);
  r.check('la ligne se coche seule quand l\'examen commencé est complet', coche, true);
  await page.evaluate(() => grilleSaveAll());
  await page.waitForTimeout(900);
  const sauve = await page.evaluate(() => {
    const u = window.__u.find(x => x.p_id === 903);
    return u && { tsh: JSON.stringify(u.p_resultats['Immuno-Sérologie'] || {}), marque: !!(u.p_resultats._saisi_serie || {}).auto_tsh,
                  vitd: !!(u.p_resultats._saisi_serie || {}).auto_vitd };
  });
  r.check('TSH enregistrée dans le dossier', !!sauve && /2\.4/.test(sauve.tsh), true);
  r.check('TSH marquée « saisie en série »', !!sauve && sauve.marque, true);
  r.check('la vitamine D (non saisie) reste à faire', !!sauve && sauve.vitd, false);

  // ── Culture : la fenêtre de saisie s'ouvre sans quitter la série ─────
  r.section('Culture : fenêtre de saisie');
  await page.evaluate(() => grilleSetCategorie(''));
  await page.evaluate(() => grilleOuvrirFiche(906, 'bact'));
  await page.waitForTimeout(400);
  const fen = await page.evaluate(() => ({
    fenetre: !!document.getElementById('grille-fiche-modal'),
    fiche: !!document.querySelector('#grille-fiche-modal #panel-bacterio'),
    serie: document.getElementById('grille-serie').style.display !== 'none',
    fa: window.__fa,
  }));
  r.check('« Saisir » ouvre la fiche dans une fenêtre', fen.fenetre && fen.fiche, true);
  r.check('la série reste ouverte derrière', fen.serie, true);
  r.check('aucun formulaire « un patient »', fen.fa, null);
  await page.evaluate(() => document.getElementById('grille-fiche-annuler').click());

  // ── Retour à l'Historique ───────────────────────────────────────────
  r.section('Quitter : retour à l\'Historique, grille normale intacte');
  await page.evaluate(() => fermerGrille());
  await page.waitForTimeout(400);
  const retour = await page.evaluate(() => ({
    historique: document.getElementById('view-historique').style.display !== 'none',
    mode: _grilleModeASaisir, date: _grilleDate, cat: _grilleCategorie,
  }));
  r.check('retour sur l\'Historique', retour.historique, true);
  r.check('mode « à saisir » quitté', retour.mode, false);
  r.check('la prochaine grille reprendra « aujourd\'hui »', retour.date, null);
  await page.evaluate(() => ouvrirGrille('nfs'));
  await page.waitForTimeout(700);
  const normale = await page.evaluate(() => ({
    mode: _grilleModeASaisir, date: _grilleDate,
    lignes: [...document.querySelectorAll('#grille-serie tr[data-doss]')].map(tr => Number(tr.dataset.doss)),
    chips: !!document.getElementById('grille-chips'),
  }));
  r.check('grille normale : pas en mode « à saisir »', normale.mode, false);
  r.check('grille normale : filtrée sur aujourd\'hui', normale.date, ymd(new Date()));
  r.check('grille normale : seulement les dossiers d\'aujourd\'hui (903, 904)', JSON.stringify(normale.lignes.sort()), '[903,904]');
  r.check('grille normale : pas de pastilles', normale.chips, false);

  // ── Rôles ───────────────────────────────────────────────────────────
  r.section('Qui voit le bouton');
  const role = async (roleName) => page.evaluate(rn => {
    _currentUser = Object.assign({}, _currentUser, { role: rn });
    majBoutonASaisir();
    const b = document.getElementById('btn-a-saisir'); return !!b && b.style.display !== 'none';
  }, roleName);
  r.check('admin : visible', await role('admin'), true);
  r.check('caissier : masqué (il ne saisit pas de résultats)', await role('caissier'), false);
  r.check('spectateur : masqué', await role('spectateur'), false);

  // ── Performance : 1 600 dossiers ────────────────────────────────────
  r.section('Rapidité sur un gros volume');
  const ms = await page.evaluate(() => {
    const grand = []; for (let i = 0; i < 1600; i++) {
      grand.push({ id: 5000 + i, type: 'Dossier', patient: { nom: 'X' + i, date: '2026-09-01' },
        resultats: { _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'], 'Biochimie': ['Glycémie à jeun'], 'Immuno-Sérologie': ['CRP — Protéine C-réactive'] } },
        savedAt: '2026-09-01T09:00:00Z', createdBy: 'a', montant: 1000 });
    }
    _dbCache = _dbCache.concat(grand);
    const t0 = performance.now(); grilleCompteASaisir(); return Math.round(performance.now() - t0);
  });
  r.check('pastille calculée en moins de 500 ms (1 600 dossiers)', ms < 500, true);
  console.log('    (durée mesurée : ' + ms + ' ms)');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();

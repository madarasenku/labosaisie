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
    window.fillAllResults = async id => { window.__fa = id; };
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
  r.check('pastille = dossiers à saisir (BPN + électro + sous-traités)', btn.badge, '3');

  // ── Ouverture : toutes dates, sans rien régler ──────────────────────
  r.section('Ouverture depuis l\'Historique');
  await page.evaluate(() => ouvrirResultatsASaisir());
  await page.waitForTimeout(900);
  const ouv = await page.evaluate(() => ({
    mode: _grilleModeASaisir, date: _grilleDate,
    titre: document.querySelector('#grille-serie')?.innerText.includes('Résultats à saisir'),
    lignes: [...document.querySelectorAll('#grille-serie tr[data-doss]')].map(tr => Number(tr.dataset.doss)).sort(),
    chips: [...document.querySelectorAll('#grille-chips button')].map(b => b.dataset.cat + ':' + b.innerText.replace(/\D+/g, '')),
  }));
  r.check('mode « à saisir » actif', ouv.mode, true);
  r.check('toutes les dates (aucun filtre date)', ouv.date, '');
  r.check('titre « Résultats à saisir »', ouv.titre, true);
  r.check('dossiers : BPN (il y a 20 j), électro, sous-traités', JSON.stringify(ouv.lignes), '[901,902,903]');
  r.check('NFS seule (904) et BPN déjà saisi (905) exclus', ouv.lignes.includes(904) || ouv.lignes.includes(905), false);
  r.check('pastilles : tout/BPN/électro/sous-traités (+ culture et EPS vérifiées)', ouv.chips.join(' '), ':5 bpn:1 electro:2 st:2');

  // ── Cultures : vérifiées sur le dossier complet ─────────────────────
  r.section('Formulaire complet pour les cultures');
  const hors = await page.evaluate(() => ({
    liste: _grilleHorsListe.map(h => h.id),
    bloc: !!document.getElementById('grille-hors'),
    bouton: !!document.querySelector('#grille-hors button[onclick="grilleOuvrirComplet(906)"]'),
  }));
  r.check('culture (906) et EPS (908) sans résultat listées ; culture déjà saisie (907) exclue', JSON.stringify(hors.liste.sort()), '[906,908]');
  r.check('bloc « formulaire complet » affiché', hors.bloc, true);
  r.check('bouton « Saisir » présent', hors.bouton, true);

  const toutHors = await page.evaluate(() => [...document.querySelectorAll('#grille-hors tr[data-hors]')].map(tr => Number(tr.dataset.hors)).sort());
  r.check('« Tout » : culture ET parasitologie des selles proposées', JSON.stringify(toutHors), '[906,908]');

  // ── Catégories ──────────────────────────────────────────────────────
  r.section('Pastilles de catégorie');
  const cat = async c => page.evaluate(k => {
    grilleSetCategorie(k);
    return {
      lignes: [...document.querySelectorAll('#grille-serie tr[data-doss]')].map(tr => Number(tr.dataset.doss)).sort(),
      cols: [...new Set([...document.querySelectorAll('#grille-serie thead th.gr-h1')].map(th => th.dataset.exam))],
      hors: !!document.getElementById('grille-hors'),
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
  r.check('Sous-traités : le dossier TSH / vitamine D', JSON.stringify(st.lignes), '[903]');
  r.check('Sous-traités : colonnes TSH et vitamine D', st.cols.sort().join(','), 'auto_tsh,auto_vitd');
  r.check('Sous-traités : bloc cultures visible', st.hors, true);
  const stHors = await page.evaluate(() => [...document.querySelectorAll('#grille-hors tr[data-hors]')].map(tr => Number(tr.dataset.hors)));
  r.check('Sous-traités : la culture, pas l\'EPS (non sous-traité)', JSON.stringify(stHors), '[906]');
  r.check('BPN : bloc cultures masqué', bpn.hors, false);

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

  // ── Hors grille : ouvrir / marquer ──────────────────────────────────
  r.section('Culture : formulaire complet et « déjà saisi »');
  await page.evaluate(() => { window.__fa = null; grilleOuvrirComplet(906); });
  await page.waitForTimeout(300);
  const comp = await page.evaluate(() => ({ fa: window.__fa, vue: document.getElementById('grille-serie').style.display, mode: _grilleModeASaisir }));
  r.check('« Saisir » ouvre le formulaire complet du dossier', comp.fa, 906);
  r.check('la grille se referme', comp.vue, 'none');
  await page.evaluate(() => ouvrirResultatsASaisir());
  await page.waitForTimeout(900);
  await page.evaluate(() => grilleSetCategorie('st'));
  await page.evaluate(() => grilleMarquerFait(906, 'ex_ecbu'));
  await page.waitForTimeout(500);
  const fait = await page.evaluate(() => {
    const u = window.__u.filter(x => x.p_id === 906).pop();
    return { marque: !!(u && u.p_resultats._st_fait && u.p_resultats._st_fait.ex_ecbu), liste: _grilleHorsListe.map(h => h.id) };
  });
  r.check('« Déjà saisi » enregistre le marquage', fait.marque, true);
  r.check('le dossier marqué quitte la liste (l\'EPS reste)', JSON.stringify(fait.liste), '[908]');

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

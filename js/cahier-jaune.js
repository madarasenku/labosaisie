/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — cahier-jaune.js

   ✅ v13.86 — Reprise du cahier jaune tenu jusqu'ici sous Excel.

   La forme suit le fichier réel, pas une idée de tableur : une ligne
   par jour ouvré, des colonnes nommées qui changent d'un mois à
   l'autre (SFPMI, SFHG, ZEHI, DIABAGATE…), des montants positifs pour
   ce qui entre et NÉGATIFS pour ce qui sort, une explication en clair
   sur les sorties, un sous-total par semaine et un total du mois.
   Le personnel doit reconnaître son cahier au premier coup d'œil.

   Deux règles de fond :

   • Un bilan prénatal INTERNE y tombe tout seul, pour son montant réel
     (10 000 en principe : 5 000 sage-femme, 5 000 laboratoire). Le
     report est fait par la base, pas par l'application : il ne doit
     dépendre ni du poste utilisé ni d'un agent qui oublie.
   • Cet argent SORT de la recette du jour, comme les dossiers
     verrouillés. Il est encaissé, mais il ne reste pas au laboratoire.

   Chargé en script classique — voir le commentaire d'index.html.
   ═══════════════════════════════════════════════════════════════ */

let _cahierMois = null;      // 'AAAA-MM'
let _cahierData = null;      // dernière réponse du serveur
let _cahierAcces = null;     // droits de l'utilisateur courant sur le cahier actif

// ✅ v13.205 — Deux cahiers partagent CE module : le JAUNE (report BPN depuis
// l'historique, saisie admin/caissier) et le NOIR (réservé à l'admin en
// écriture, partage optionnel en lecture). _cahierActif choisit lequel on
// affiche ; _cjR() résout le nom de la RPC correspondante. Le jaune ne change
// EN RIEN : ses RPC et ses tables gardent leurs noms.
let _cahierActif = 'jaune';               // 'jaune' | 'noir'
const _cahierAccesParType = { jaune: null, noir: null };
const _CAHIER_RPC = {
  jaune: { acces: 'mon_acces_cahier',      get: 'get_cahier_jaune', colonne: 'gerer_colonne_cahier',
           ajouter: 'ajouter_ecriture_cahier', modifier: 'modifier_ecriture_cahier',
           supprimer: 'supprimer_ecriture_cahier', partage: 'definir_partage_cahier' },
  noir:  { acces: 'mon_acces_cahier_noir', get: 'get_cahier_noir',  colonne: 'gerer_colonne_cahier_noir',
           ajouter: 'ajouter_ecriture_noir', modifier: 'modifier_ecriture_noir',
           supprimer: 'supprimer_ecriture_noir', partage: 'definir_partage_cahier_noir' },
};
function _cjR(k) { return _CAHIER_RPC[_cahierActif][k]; }
function _cahierEstNoir() { return _cahierActif === 'noir'; }

// Bascule d'onglet : choisit le cahier puis (re)charge la vue partagée.
function ouvrirCahier(type) {
  _cahierActif = (type === 'noir') ? 'noir' : 'jaune';
  _cahierData = null;
  _cahierAcces = _cahierAccesParType[_cahierActif] || null;
  showView('cahier');   // le handler de showView met à jour l'entête + charge
}

function _majEnteteCahier() {
  const noir = _cahierEstNoir();
  const t = document.getElementById('cahier-titre');
  if (t) t.textContent = noir ? '📓 Caisse noire' : '📒 Cahier jaune';
  const v = document.getElementById('view-cahier');
  if (v) v.setAttribute('data-cahier', _cahierActif);
  const intro = document.getElementById('cahier-intro-jaune');
  if (intro) intro.style.display = noir ? 'none' : '';
  const bj = document.getElementById('btn-nav-cahier');      if (bj) bj.classList.toggle('active', !noir);
  const bn = document.getElementById('btn-nav-cahier-noir'); if (bn) bn.classList.toggle('active', noir);
}

function _majCartesCahier() {
  const a = _cahierAccesParType[_cahierActif] || {};
  // v13.210 — Le cahier noir est ouvert à tous : chaque agent (hors spectateur)
  // peut gérer les colonnes. Le partage n'a plus de sens pour le noir (il n'est
  // plus réservé), on masque donc sa carte. Le jaune reste inchangé.
  const carte = document.getElementById('cahier-colonnes-card');
  if (carte) carte.style.display = a.admin ? '' : 'none';
  const partage = document.getElementById('cahier-partage-card');
  if (partage) partage.style.display = (a.admin && !_cahierEstNoir()) ? '' : 'none';
  if (a.admin) { _cahierAcces = a; if (!_cahierEstNoir()) remplirFormulairePartage(); }
}

function _cjMoisCourant() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function _cjFcfa(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR');
}

/** Jours du mois, groupés par semaine calendaire (lundi → dimanche).
 *  ✅ Labo ouvert 24h/24, 7j/7 : samedi et dimanche sont désormais inclus
 *  (ils étaient auparavant ignorés). La semaine se clôt le dimanche. */
function _cjSemaines(mois) {
  const [a, m] = mois.split('-').map(Number);
  const semaines = [];
  let courante = [];
  const dernier = new Date(a, m, 0).getDate();
  for (let j = 1; j <= dernier; j++) {
    const d = new Date(a, m - 1, j);
    courante.push(mois + '-' + String(j).padStart(2, '0'));
    if (d.getDay() === 0) { semaines.push(courante); courante = []; }  // dimanche → fin de semaine
  }
  if (courante.length) semaines.push(courante);
  return semaines;
}

/**
 * ✅ v13.92 — Le cahier appartient à l'administrateur. Il peut l'ouvrir à
 * d'autres profils, et borner ce qu'ils voient à une période : un spectateur
 * n'a pas de raison de parcourir douze mois d'arriéré pour vérifier une
 * semaine. Ces droits sont lus au démarrage pour savoir s'il faut seulement
 * afficher l'onglet.
 */
async function chargerAccesCahier() {
  if (typeof _sb === 'undefined' || !_sb || !TK()) return null;
  // ✅ v13.205 — On interroge l'accès aux DEUX cahiers pour afficher/masquer
  // chaque onglet indépendamment (l'un peut être ouvert, l'autre non).
  for (const [type, btnId] of [['jaune', 'btn-nav-cahier'], ['noir', 'btn-nav-cahier-noir']]) {
    let acces = { autorise: false, admin: false };
    try {
      const { data, error } = await _sb.rpc(_CAHIER_RPC[type].acces, { p_token: TK() });
      if (!error && data && !data.erreur) acces = data;
    } catch (e) {}
    _cahierAccesParType[type] = acces;
    const btn = document.getElementById(btnId);
    if (btn) btn.style.display = acces.autorise ? '' : 'none';
  }
  _cahierAcces = _cahierAccesParType[_cahierActif];
  _majCartesCahier();
  return _cahierAcces;
}

function remplirFormulairePartage() {
  const c = _cahierAcces?.config;
  if (!c) return;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
  const cocher = (id, v) => { const e = document.getElementById(id); if (e) e.checked = !!v; };
  cocher('partage-actif', c.actif);
  const roles = Array.isArray(c.roles) ? c.roles : [];
  ['caissier', 'spectateur', 'agent'].forEach(r => cocher('partage-role-' + r, roles.includes(r)));
  set('partage-debut', c.periode_debut);
  set('partage-fin', c.periode_fin);
  const info = document.getElementById('partage-info');
  if (info) info.textContent = c.maj_par
    ? 'Dernière modification par ' + c.maj_par + ' le '
      + new Date(c.maj_le).toLocaleString('fr-FR')
    : '';
}

async function enregistrerPartageCahier() {
  if (!isAdmin()) { toast('Réservé à l\'administrateur', 'err'); return; }
  const roles = ['caissier', 'spectateur', 'agent']
    .filter(r => document.getElementById('partage-role-' + r)?.checked);
  const actif = !!document.getElementById('partage-actif')?.checked;
  const debut = document.getElementById('partage-debut')?.value || null;
  const fin   = document.getElementById('partage-fin')?.value || null;
  // Autoriser le partage sans désigner personne ne partage rien : mieux vaut
  // le dire que de laisser croire que c'est ouvert.
  if (actif && !roles.length) { toast('Choisissez au moins un profil', 'err'); return; }

  try {
    const { data, error } = await _sb.rpc(_cjR('partage'), {
      p_token: TK(), p_actif: actif, p_roles: roles, p_debut: debut, p_fin: fin,
    });
    if (error || !data || data.erreur) {
      toast('Refusé : ' + (error?.message || data?.erreur || '?'), 'err'); return;
    }
    toast(actif ? 'Cahier partagé ✓' : 'Cahier redevenu privé ✓', 'ok');
    await chargerAccesCahier();
  } catch (e) { toast('Erreur : ' + (e.message || e), 'err'); }
}

async function chargerCahierJaune(mois) {
  _cahierMois = mois || _cahierMois || _cjMoisCourant();
  const sel = document.getElementById('cahier-mois');
  if (sel) sel.value = _cahierMois;
  if (typeof _sb === 'undefined' || !_sb) return;


  try {
    showLoading('Chargement du cahier…');
    const { data, error } = await _sb.rpc(_cjR('get'),
      { p_token: TK(), p_mois: _cahierMois });
    hideLoading();
    if (error || !data || data.erreur) {
      const z = document.getElementById('cahier-tableau');
      if (z) z.innerHTML = '<div style="color:#b91c1c">'
        + (data?.erreur === 'forbidden'
            ? 'Ce cahier ne vous est pas ouvert.'
            : data?.erreur === 'coffre_ferme'
            // Même phrase que pour un refus ordinaire : dire « coffre fermé »
            // annoncerait qu'il existe une autre façon d'entrer.
            ? 'Ce cahier ne vous est pas ouvert.'
            : 'Cahier indisponible' + (data?.erreur ? ' (' + data.erreur + ')' : ''))
        + '</div>';
      return;
    }
    // Hors de la période autorisée, on le dit clairement plutôt que de
    // laisser croire à un mois vide.
    if (data.hors_periode) {
      _cahierData = data;
      const z = document.getElementById('cahier-tableau');
      if (z) z.innerHTML = '<div style="color:#92400e">Ce mois est en dehors de la '
        + 'période que l\'administrateur vous a ouverte.</div>';
      return;
    }
    _cahierData = data;
    renderCahierJaune();
  } catch (e) {
    hideLoading();
  }
}

function renderCahierJaune() {
  const zone = document.getElementById('cahier-tableau');
  if (!zone || !_cahierData) return;
  const colonnes = _cahierData.colonnes || [];
  const ecritures = _cahierData.ecritures || [];

  // Index : jour → colonne → { total, lignes }
  const parJour = {};
  ecritures.forEach(e => {
    const j = String(e.jour).slice(0, 10);
    if (!parJour[j]) parJour[j] = {};
    if (!parJour[j][e.colonne_id]) parJour[j][e.colonne_id] = { total: 0, lignes: [] };
    parJour[j][e.colonne_id].total += Number(e.montant) || 0;
    parJour[j][e.colonne_id].lignes.push(e);
  });

  const totauxColonne = {};
  colonnes.forEach(c => { totauxColonne[c.id] = 0; });
  let totalMois = 0;

  // ✅ v13.87 — Chaque écriture reste visible avec le nom de la patiente et
  // son montant, précédée d'un NUMÉRO D'ORDRE continu sur le mois. Une somme
  // seule (« 20000 ») ne permet pas de pointer le cahier contre les
  // dossiers ; un numéro d'ordre permet de dire « le n° 14 » sans ambiguïté.
  const numeros = {};
  [...ecritures]
    .sort((a, b) => String(a.jour).localeCompare(String(b.jour)) || (a.id - b.id))
    .forEach((e, i) => { numeros[e.id] = i + 1; });

  // L'explication d'un report automatique a la forme
  // « BPN interne — NOM (0092-0826) » : on en extrait le nom pour l'afficher
  // seul, et on retombe sur le texte entier si la forme change.
  const nomDeLigne = l => {
    const t = l.explication || '';
    const m = t.match(/^BPN interne\s*[—-]\s*(.+?)\s*\(/);
    if (m) return m[1];
    return t || (l.origine === 'bpn_interne' ? 'BPN interne' : '—');
  };

  const cellule = (j, c) => {
    const d = parJour[j] && parJour[j][c.id];
    if (!d || !d.lignes.length) return '<td style="text-align:right;color:#cbd5e1">·</td>';
    // ✅ v13.88 — Chaque ligne est cliquable pour être corrigée. Un registre
    // qu'on ne peut que remplir et vider oblige à supprimer puis ressaisir,
    // ce qui casse le lien avec le dossier et la numérotation.
    const modifiable = !isSpectateur() && !_cahierData?.lecture_seule;
    const estST = _cjEstSousTraitance(c);
    const corps = d.lignes.map(l => {
      const v = Number(l.montant) || 0;
      // v13.210 — Pour une sous-traitance, on montre si la somme a été retirée.
      const badge = estST
        ? (l.retire === true
            ? ' <span style="font-size:10px;color:#15803d;font-weight:700">✓ retirée</span>'
            : ' <span style="font-size:10px;color:#b45309;font-weight:700">⏳ non retirée</span>')
        : '';
      // ✅ Poste (labo 24h/24) d'après l'heure d'enregistrement de l'écriture.
      const pb = (typeof posteDepuisHeure === 'function') ? posteDepuisHeure(l.created_at) : '';
      const posteIcone = pb
        ? ' <span title="' + pb + '" style="font-size:10px">' + (pb === 'Permanence' ? '☀️' : '🌙') + '</span>'
        : '';
      return '<div style="white-space:nowrap;color:' + (v < 0 ? '#b91c1c' : '#0b2545')
        + (modifiable ? ';cursor:pointer" title="Cliquer pour modifier"'
                        + ' onclick="ouvrirSaisieCahier(\'' + j + '\',' + l.id + ')"' : '"') + '>'
        + '<span style="color:var(--text-muted);font-weight:400">' + numeros[l.id] + '.</span> '
        + '<span style="font-weight:400">' + esc(nomDeLigne(l)) + '</span> '
        + '<strong>' + _cjFcfa(v) + '</strong>' + posteIcone + badge + '</div>';
    }).join('');
    // Le sous-total de la cellule n'apparaît que s'il y a plusieurs écritures :
    // le répéter sous un montant unique n'apprend rien et alourdit la page.
    const sous = d.lignes.length > 1
      ? '<div style="border-top:1px solid #e2e8f0;margin-top:2px;padding-top:2px;font-weight:800">'
        + _cjFcfa(d.total) + '</div>'
      : '';
    return '<td style="text-align:right;font-size:11.5px;vertical-align:top">' + corps + sous + '</td>';
  };

  let corps = '';
  _cjSemaines(_cahierMois).forEach((semaine, i) => {
    const sousTotaux = {};
    colonnes.forEach(c => { sousTotaux[c.id] = 0; });
    let sousTotalLigne = 0;

    semaine.forEach(j => {
      let totalJour = 0;
      colonnes.forEach(c => {
        const v = (parJour[j] && parJour[j][c.id] ? parJour[j][c.id].total : 0);
        sousTotaux[c.id] += v; totauxColonne[c.id] += v; totalJour += v;
      });
      sousTotalLigne += totalJour; totalMois += totalJour;
      const d = new Date(j + 'T12:00:00');
      corps += '<tr' + (totalJour ? '' : ' style="color:var(--text-muted)"') + '>'
        + '<td style="white-space:nowrap">' + d.toLocaleDateString('fr-FR',
            { weekday: 'short', day: '2-digit', month: '2-digit' }) + '</td>'
        + colonnes.map(c => cellule(j, c)).join('')
        + '<td style="text-align:right;font-weight:700">' + (totalJour ? _cjFcfa(totalJour) : '·') + '</td>'
        + '<td style="text-align:center">'
        + (isSpectateur() || _cahierData?.lecture_seule ? '' : '<button class="btn btn-outline" style="padding:2px 7px;font-size:11px"'
            + ' onclick="ouvrirSaisieCahier(\'' + j + '\')" title="Ajouter une écriture">+</button>')
        + '</td></tr>';
    });

    // Le sous-total hebdomadaire est repris tel quel du cahier Excel :
    // c'est le rythme auquel le laboratoire pointe ses comptes.
    corps += '<tr style="background:#fffbeb;font-weight:800;border-top:1.5px solid #fbbf24">'
      + '<td>SEMAINE ' + (i + 1) + '</td>'
      + colonnes.map(c => '<td style="text-align:right;color:'
          + (sousTotaux[c.id] < 0 ? '#b91c1c' : '#0b2545') + '">'
          + _cjFcfa(sousTotaux[c.id]) + '</td>').join('')
      + '<td style="text-align:right">' + _cjFcfa(sousTotalLigne) + '</td><td></td></tr>';
  });

  // ✅ Bilan sous-traitance : somme ENCAISSÉE (retirée) vs NON ENCAISSÉE (non
  //   retirée). Les montants de sous-traitance sont des sorties (négatifs) ; on
  //   affiche leur valeur absolue, plus parlante sur un cahier.
  const stColIds = new Set(colonnes.filter(c => _cjEstSousTraitance(c)).map(c => c.id));
  let stRetire = 0, stNonRetire = 0;
  if (stColIds.size) {
    ecritures.forEach(e => {
      if (!stColIds.has(e.colonne_id)) return;
      const v = Math.abs(Number(e.montant) || 0);
      if (e.retire === true) stRetire += v; else stNonRetire += v;
    });
  }
  const blocST = stColIds.size
    ? '<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:stretch">'
      + '<div style="flex:1;min-width:150px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:8px 12px">'
      + '<div style="font-size:11px;color:#15803d;font-weight:700">✓ Sous-traitance retirée (encaissée)</div>'
      + '<div style="font-size:15px;font-weight:800;color:#15803d">' + _cjFcfa(stRetire) + '</div></div>'
      + '<div style="flex:1;min-width:150px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px">'
      + '<div style="font-size:11px;color:#b45309;font-weight:700">⏳ Sous-traitance non retirée (non encaissée)</div>'
      + '<div style="font-size:15px;font-weight:800;color:#b45309">' + _cjFcfa(stNonRetire) + '</div></div>'
      + '<div style="flex:1;min-width:150px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px">'
      + '<div style="font-size:11px;color:#334155;font-weight:700">Total sous-traitance</div>'
      + '<div style="font-size:15px;font-weight:800;color:#334155">' + _cjFcfa(stRetire + stNonRetire) + '</div></div>'
      + '</div>'
    : '';

  zone.innerHTML =
    '<div class="table-wrap"><table style="width:100%;font-size:12.5px;border-collapse:collapse">'
    + '<thead><tr><th style="text-align:left">Date</th>'
    + colonnes.map(c => '<th style="text-align:right">' + esc(c.libelle)
        + (c.archivee ? ' <span style="font-weight:400;font-size:10px">(archivée)</span>' : '')
        + '</th>').join('')
    + '<th style="text-align:right">TOTAL</th><th></th></tr></thead>'
    + '<tbody>' + corps + '</tbody>'
    + '<tfoot><tr style="background:#0b2545;color:#fff;font-weight:800">'
    + '<td>FIN DU MOIS</td>'
    + colonnes.map(c => '<td style="text-align:right">' + _cjFcfa(totauxColonne[c.id]) + '</td>').join('')
    + '<td style="text-align:right;font-size:14px">' + _cjFcfa(totalMois) + '</td><td></td>'
    + '</tr></tfoot></table></div>'
    + blocST
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:8px">'
    + 'Les montants négatifs sont des sorties. Survolez une cellule pour en voir le détail. '
    + '☀️ = Permanence (8h–16h) · 🌙 = Garde (16h–8h).'
    + (_cahierEstNoir() ? '' : ' Les bilans prénatals internes y sont reportés automatiquement.')
    + '</div>';
}

/**
 * Fenêtre de saisie pour une journée. Avec un `idEcriture`, elle sert à
 * corriger une ligne existante plutôt qu'à en créer une.
 */
async function ouvrirSaisieCahier(jour, idEcriture) {
  if (isSpectateur() || _cahierData?.lecture_seule) { toast('Lecture seule', 'err'); return; }
  const colonnes = (_cahierData?.colonnes || []).filter(c => !c.archivee);
  if (!colonnes.length) { toast('Aucune colonne disponible', 'err'); return; }

  const existante = idEcriture
    ? (_cahierData?.ecritures || []).find(e => e.id === idEcriture)
    : null;
  const auto = existante && existante.origine === 'bpn_interne';

  const old = document.getElementById('cahier-modal');
  if (old) old.remove();
  const bd = document.createElement('div');
  bd.id = 'cahier-modal';
  bd.className = 'modal-backdrop';
  bd.innerHTML =
    '<div class="modal-box" style="max-width:440px">'
    + '<div class="modal-title">' + (existante ? 'Modifier l\'écriture du ' : 'Écriture du ')
    + new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR') + '</div>'
    // Une écriture issue d'un dossier ne doit pas être corrigée à l'aveugle :
    // le vrai correctif est souvent dans le dossier lui-même.
    + (auto ? '<div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;'
              + 'padding:8px 10px;font-size:12px;margin-bottom:10px">'
              + 'Écriture reportée automatiquement depuis un bilan prénatal. La corriger ici '
              + 'ne change pas le montant du dossier.</div>' : '')
    + '<label style="font-size:12px;font-weight:600">Colonne</label>'
    + '<select id="cj-colonne" style="width:100%;margin-bottom:10px" onchange="_cjMajModaleColonne()">'
    + colonnes.map(c => '<option value="' + c.id + '"'
        + (_cjEstSousTraitance(c) ? ' data-st="1"' : '')
        + (existante && existante.colonne_id === c.id ? ' selected' : '')
        + '>' + esc(c.libelle) + '</option>').join('')
    + '</select>'
    + '<label id="cj-montant-label" style="font-size:12px;font-weight:600">Montant (négatif pour une sortie)</label>'
    + '<input type="number" id="cj-montant" style="width:100%;margin-bottom:10px" placeholder="10000 ou -5000"'
    + (existante ? ' value="' + Number(existante.montant) + '"' : '') + '>'
    // v13.210 — Sous-traitance : on demande si la somme a déjà été retirée.
    + '<div id="cj-retire-row" style="display:none;margin-bottom:10px">'
    + '<label style="font-size:12px;font-weight:600">La somme a-t-elle été retirée ?</label>'
    + '<select id="cj-retire" style="width:100%">'
    + '<option value="non"' + (existante && existante.retire === false ? ' selected' : '') + '>Non — pas encore retirée</option>'
    + '<option value="oui"' + (existante && existante.retire === true ? ' selected' : '') + '>Oui — déjà retirée</option>'
    + '</select></div>'
    + '<label style="font-size:12px;font-weight:600">Explication '
    + '<span style="font-weight:400;color:var(--text-muted)">(obligatoire pour une sortie)</span></label>'
    + '<input type="text" id="cj-explication" style="width:100%;margin-bottom:6px" placeholder="MR NGUESSAN"'
    + (existante && existante.explication ? ' value="' + esc(existante.explication) + '"' : '') + '>'
    + '<div id="cj-err" style="color:#b91c1c;font-size:12px;min-height:16px"></div>'
    + '<div class="modal-actions" style="justify-content:space-between">'
    + (existante
        ? '<button class="btn btn-danger" onclick="supprimerEcritureCahier(' + existante.id + ')">🗑 Supprimer</button>'
        : '<span></span>')
    + '<span>'
    + '<button class="btn" onclick="document.getElementById(\'cahier-modal\').remove()">Annuler</button>'
    + '<button class="btn btn-primary" style="margin-left:8px" onclick="enregistrerEcritureCahier(\''
    + jour + '\'' + (existante ? ',' + existante.id : '') + ')">Enregistrer</button>'
    + '</span></div></div>';
  document.body.appendChild(bd);
  _cjMajModaleColonne();
  setTimeout(() => document.getElementById('cj-montant')?.focus(), 50);
}

// La colonne sélectionnée est-elle « SOUS TRAITANCE » ?
function _cjEstSousTraitance(c) {
  return (c && (c.libelle || '')).toUpperCase() === 'SOUS TRAITANCE';
}

// v13.210 — Adapte la fenêtre à la colonne : la sous-traitance n'accepte que
// des sorties (montant négatif) et demande si la somme a déjà été retirée.
function _cjMajModaleColonne() {
  const sel = document.getElementById('cj-colonne');
  const opt = sel?.options[sel.selectedIndex];
  const estST = opt?.getAttribute('data-st') === '1';
  const row = document.getElementById('cj-retire-row');
  if (row) row.style.display = estST ? '' : 'none';
  const lbl = document.getElementById('cj-montant-label');
  const inp = document.getElementById('cj-montant');
  if (estST) {
    if (lbl) lbl.textContent = 'Montant de la sous-traitance (sortie, sera négatif)';
    if (inp && inp.value) { const v = Math.abs(Number(inp.value) || 0); inp.value = v ? -v : ''; }
    if (inp) inp.placeholder = '-5000';
  } else {
    if (lbl) lbl.textContent = 'Montant (négatif pour une sortie)';
    if (inp) inp.placeholder = '10000 ou -5000';
  }
}

async function supprimerEcritureCahier(id) {
  const ok = await showConfirmModal({
    icon: '🗑️',
    title: 'Supprimer cette écriture ?',
    message: 'Elle disparaîtra du cahier. Si elle vient d\'un bilan prénatal, '
           + 'elle sera reportée à nouveau si le dossier est modifié.',
    confirmText: 'Supprimer', confirmClass: 'btn-danger',
  });
  if (!ok) return;
  try {
    const { data, error } = await _sb.rpc(_cjR('supprimer'), { p_token: TK(), p_id: id });
    if (error || !data || data.erreur) {
      toast('Refusé : ' + (error?.message || data?.erreur || '?'), 'err'); return;
    }
    document.getElementById('cahier-modal')?.remove();
    toast('Écriture supprimée ✓', 'ok');
    await chargerCahierJaune(_cahierMois);
  } catch (e) { toast('Erreur : ' + (e.message || e), 'err'); }
}

async function enregistrerEcritureCahier(jour, idEcriture) {
  const err = document.getElementById('cj-err');
  const colSel = document.getElementById('cj-colonne');
  const colonne = Number(colSel?.value);
  const estST = colSel?.options[colSel.selectedIndex]?.getAttribute('data-st') === '1';
  let montant = Number(document.getElementById('cj-montant')?.value);
  const expl = (document.getElementById('cj-explication')?.value || '').trim();
  if (err) err.textContent = '';
  if (!montant) { if (err) err.textContent = 'Indiquez un montant différent de zéro.'; return; }
  // v13.210 — La sous-traitance est toujours une sortie : on force le négatif.
  if (estST && montant > 0) montant = -montant;
  if (estST && montant >= 0) { if (err) err.textContent = 'La sous-traitance doit être une sortie (montant négatif).'; return; }
  // Contrôle côté écran ET côté serveur : sans explication, une sortie de
  // caisse devient inexplicable un mois plus tard.
  if (montant < 0 && !expl) {
    if (err) err.textContent = 'Une sortie doit être expliquée.'; return;
  }
  // v13.210 — « somme retirée ? » n'a de sens que pour la sous-traitance.
  const retire = estST
    ? (document.getElementById('cj-retire')?.value === 'oui')
    : null;

  // ✅ Les deux cahiers (jaune ET noir) acceptent désormais p_retire : la
  // sous-traitance y est suivie « retirée / non retirée ». Pour une colonne
  // non sous-traitance, retire vaut null (le serveur l'ignore).
  const extra = { p_retire: retire };

  try {
    const { data, error } = idEcriture
      ? await _sb.rpc(_cjR('modifier'), {
          p_token: TK(), p_id: idEcriture, p_jour: jour, p_colonne_id: colonne,
          p_montant: montant, p_explication: expl || null, ...extra,
        })
      : await _sb.rpc(_cjR('ajouter'), {
      p_token: TK(), p_jour: jour, p_colonne_id: colonne,
      p_montant: montant, p_explication: expl || null, ...extra,
    });
    if (error || !data || data.erreur) {
      if (err) err.textContent = 'Refusé : ' + (error?.message || data?.erreur || '?');
      return;
    }
    document.getElementById('cahier-modal')?.remove();
    toast(idEcriture ? 'Écriture modifiée ✓' : 'Écriture enregistrée ✓', 'ok');
    await chargerCahierJaune(_cahierMois);
  } catch (e) {
    if (err) err.textContent = 'Erreur : ' + (e.message || e);
  }
}

async function ajouterColonneCahier() {
  // v13.210 — Pour le cahier noir, tout agent (hors spectateur) gère les colonnes ;
  // pour le jaune, cela reste réservé à l'administrateur. On lit le droit « admin »
  // renvoyé par la RPC d'accès du cahier actif plutôt que le rôle global.
  const a = _cahierAccesParType[_cahierActif] || {};
  if (!a.admin) { toast('Action non autorisée', 'err'); return; }
  const libelle = (document.getElementById('cahier-nouvelle-colonne')?.value || '').trim();
  if (!libelle) { toast('Indiquez un nom de colonne', 'err'); return; }
  const { data, error } = await _sb.rpc(_cjR('colonne'),
    { p_token: TK(), p_action: 'ajouter', p_libelle: libelle, p_id: null });
  if (error || !data || data.erreur) {
    toast('Refusé : ' + (error?.message || data?.erreur || '?'), 'err'); return;
  }
  document.getElementById('cahier-nouvelle-colonne').value = '';
  toast('Colonne ajoutée ✓', 'ok');
  await chargerCahierJaune(_cahierMois);
}

function changerMoisCahier() {
  const sel = document.getElementById('cahier-mois');
  if (sel && sel.value) chargerCahierJaune(sel.value);
}

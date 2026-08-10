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

function _cjMoisCourant() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function _cjFcfa(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR');
}

/** Jours ouvrés du mois, groupés par semaine (lundi → vendredi). */
function _cjSemaines(mois) {
  const [a, m] = mois.split('-').map(Number);
  const semaines = [];
  let courante = [];
  const dernier = new Date(a, m, 0).getDate();
  for (let j = 1; j <= dernier; j++) {
    const d = new Date(a, m - 1, j);
    const jour = d.getDay();
    if (jour === 0 || jour === 6) continue;          // le labo ne tient pas le cahier le week-end
    courante.push(mois + '-' + String(j).padStart(2, '0'));
    if (jour === 5) { semaines.push(courante); courante = []; }
  }
  if (courante.length) semaines.push(courante);
  return semaines;
}

async function chargerCahierJaune(mois) {
  _cahierMois = mois || _cahierMois || _cjMoisCourant();
  const sel = document.getElementById('cahier-mois');
  if (sel) sel.value = _cahierMois;
  if (typeof _sb === 'undefined' || !_sb) return;

  try {
    showLoading('Chargement du cahier…');
    const { data, error } = await _sb.rpc('get_cahier_jaune',
      { p_token: TK(), p_mois: _cahierMois });
    hideLoading();
    if (error || !data || data.erreur) {
      const z = document.getElementById('cahier-tableau');
      if (z) z.innerHTML = '<div style="color:#b91c1c">Cahier indisponible'
        + (data?.erreur ? ' (' + data.erreur + ')' : '') + '</div>';
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

  const cellule = (j, c) => {
    const d = parJour[j] && parJour[j][c.id];
    if (!d || !d.total) return '<td style="text-align:right;color:#cbd5e1">·</td>';
    const negatif = d.total < 0;
    const titre = d.lignes.map(l => (l.explication || l.origine)).join(' | ');
    return '<td style="text-align:right;font-weight:600;color:' + (negatif ? '#b91c1c' : '#0b2545')
      + '" title="' + esc(titre) + '">' + _cjFcfa(d.total) + '</td>';
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
        + (isSpectateur() ? '' : '<button class="btn btn-outline" style="padding:2px 7px;font-size:11px"'
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
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-top:8px">'
    + 'Les montants négatifs sont des sorties. Survolez une cellule pour en voir le détail. '
    + 'Les bilans prénatals internes y sont reportés automatiquement.</div>';
}

/** Petite fenêtre de saisie pour une journée donnée. */
async function ouvrirSaisieCahier(jour) {
  if (isSpectateur()) { toast('Lecture seule', 'err'); return; }
  const colonnes = (_cahierData?.colonnes || []).filter(c => !c.archivee);
  if (!colonnes.length) { toast('Aucune colonne disponible', 'err'); return; }

  const old = document.getElementById('cahier-modal');
  if (old) old.remove();
  const bd = document.createElement('div');
  bd.id = 'cahier-modal';
  bd.className = 'modal-backdrop';
  bd.innerHTML =
    '<div class="modal-box" style="max-width:420px">'
    + '<div class="modal-title">Écriture du '
    + new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR') + '</div>'
    + '<label style="font-size:12px;font-weight:600">Colonne</label>'
    + '<select id="cj-colonne" style="width:100%;margin-bottom:10px">'
    + colonnes.map(c => '<option value="' + c.id + '">' + esc(c.libelle) + '</option>').join('')
    + '</select>'
    + '<label style="font-size:12px;font-weight:600">Montant (négatif pour une sortie)</label>'
    + '<input type="number" id="cj-montant" style="width:100%;margin-bottom:10px" placeholder="10000 ou -5000">'
    + '<label style="font-size:12px;font-weight:600">Explication '
    + '<span style="font-weight:400;color:var(--text-muted)">(obligatoire pour une sortie)</span></label>'
    + '<input type="text" id="cj-explication" style="width:100%;margin-bottom:6px" placeholder="MR NGUESSAN">'
    + '<div id="cj-err" style="color:#b91c1c;font-size:12px;min-height:16px"></div>'
    + '<div class="modal-actions" style="justify-content:flex-end">'
    + '<button class="btn" onclick="document.getElementById(\'cahier-modal\').remove()">Annuler</button>'
    + '<button class="btn btn-primary" onclick="enregistrerEcritureCahier(\'' + jour + '\')">Enregistrer</button>'
    + '</div></div>';
  document.body.appendChild(bd);
  setTimeout(() => document.getElementById('cj-montant')?.focus(), 50);
}

async function enregistrerEcritureCahier(jour) {
  const err = document.getElementById('cj-err');
  const colonne = Number(document.getElementById('cj-colonne')?.value);
  const montant = Number(document.getElementById('cj-montant')?.value);
  const expl = (document.getElementById('cj-explication')?.value || '').trim();
  if (err) err.textContent = '';
  if (!montant) { if (err) err.textContent = 'Indiquez un montant différent de zéro.'; return; }
  // Contrôle côté écran ET côté serveur : sans explication, une sortie de
  // caisse devient inexplicable un mois plus tard.
  if (montant < 0 && !expl) {
    if (err) err.textContent = 'Une sortie doit être expliquée.'; return;
  }

  try {
    const { data, error } = await _sb.rpc('ajouter_ecriture_cahier', {
      p_token: TK(), p_jour: jour, p_colonne_id: colonne,
      p_montant: montant, p_explication: expl || null,
    });
    if (error || !data || data.erreur) {
      if (err) err.textContent = 'Refusé : ' + (error?.message || data?.erreur || '?');
      return;
    }
    document.getElementById('cahier-modal')?.remove();
    toast('Écriture enregistrée ✓', 'ok');
    await chargerCahierJaune(_cahierMois);
  } catch (e) {
    if (err) err.textContent = 'Erreur : ' + (e.message || e);
  }
}

async function ajouterColonneCahier() {
  if (!isAdmin()) { toast('Réservé à l\'administrateur', 'err'); return; }
  const libelle = (document.getElementById('cahier-nouvelle-colonne')?.value || '').trim();
  if (!libelle) { toast('Indiquez un nom de colonne', 'err'); return; }
  const { data, error } = await _sb.rpc('gerer_colonne_cahier',
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

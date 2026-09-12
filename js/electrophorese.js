/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — electrophorese.js

   ✅ v13.171 — « Électrophorèse de la semaine » : liste hebdomadaire,
   imprimable, des patients ayant une électrophorèse de l'hémoglobine
   À FAIRE — c.-à-d. l'examen est coché dans le dossier ET le profil Hb
   n'est pas encore rendu.

   Un patient sort donc de la liste de deux façons :
     • on décoche l'électrophorèse dans son dossier (déjà faite ailleurs) ;
     • son profil Hb est saisi (électrophorèse rendue).

   Colonnes : N° dossier · Nom · Groupe · Électrophorèse (case vide, à
   remplir à la main). Tailles reprises du compte rendu (Segoe UI, tableau
   9 pt), impression noir & blanc via #print-render.

   Chargé en script classique (après session-pwa.js / supabase-db.js) — voir
   le commentaire d'index.html. Réutilise : _dbCache, _recDate, ensureFull,
   esc, formatAge, showLoading/hideLoading.
   ═══════════════════════════════════════════════════════════════ */

// Semaine affichée : une date QUELCONQUE dans la semaine voulue (null = courante).
let _electroRef = null;

function _elecP(n) { return String(n).padStart(2, '0'); }
function _elecJourLocal(d) { return d.getFullYear() + '-' + _elecP(d.getMonth() + 1) + '-' + _elecP(d.getDate()); }

// Lundi 00:00 de la semaine contenant d (semaine lundi→dimanche).
function _elecLundi(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const j = x.getDay();                    // dimanche = 0
  x.setDate(x.getDate() - (j === 0 ? 6 : j - 1));
  return x;
}
function _elecBornes(ref) {
  const lundi = _elecLundi(ref || new Date());
  const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6);
  return { lundi, dim, du: _elecJourLocal(lundi), au: _elecJourLocal(dim) };
}
function _elecLibelleSemaine(b) {
  const opts = { day: 'numeric', month: 'long' };
  const d1 = b.lundi.toLocaleDateString('fr-FR', opts);
  const d2 = b.dim.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return 'Semaine du lundi ' + d1 + ' au dimanche ' + d2;
}

// Électrophorèse de l'hémoglobine cochée dans le dossier ?
function _elecCochee(res) {
  const c = (res && res._examens_coches) || {};
  return Object.values(c).some(arr => (arr || []).some(l => /lectrophor/i.test(String(l))));
}
// Profil Hb déjà rendu ? (résultat de l'électrophorèse)
function _elecProfilRendu(res) {
  return !!(res && res['Hématologie'] && String(res['Hématologie']['Profil Hb'] || '').trim());
}
// Groupe sanguin lisible (« O Rh+ ») ou '' si non renseigné.
function _elecGroupe(res) {
  const g = (res && res['Groupe sanguin']) || {};
  const abo = String(g['Groupe ABO'] || '').trim();
  if (!abo) return '';
  const rh = String(g['Rhésus'] || '').trim();
  return abo + (rh === 'Positif' ? ' Rh+' : rh === 'Négatif' ? ' Rh−' : '');
}

// Dossiers À FAIRE de la semaine (charge le détail complet des candidats).
async function _elecDossiers(ref) {
  const b = _elecBornes(ref);
  const toutes = (typeof _dbCache !== 'undefined' ? _dbCache : []) || [];
  // Pré-filtre sur le cache léger : semaine + (électro cochée OU bilan prénatal).
  const candidats = toutes.filter(r =>
    !r.deletedAt && !r._hardDeleted && !r.restrictedBy
    && _recDate(r) >= b.du && _recDate(r) <= b.au
    && (_elecCochee(r.resultats) || r.est_bpn));
  if (typeof ensureFull === 'function') {
    try { await Promise.all(candidats.map(r => ensureFull(r))); } catch (e) { /* réseau : garder l'existant */ }
  }
  // Filtre définitif : électro réellement cochée ET profil Hb non rendu.
  return candidats
    .filter(r => _elecCochee(r.resultats) && !_elecProfilRendu(r.resultats))
    .sort((a, b2) => String(a.savedAt || '').localeCompare(String(b2.savedAt || '')));
}

function _elecLigne(r) {
  const p = r.patient || {};
  return {
    dossier: p.dossier || p.ancien_dossier || '—',
    nom: p.nom || '—',
    groupe: _elecGroupe(r.resultats),
  };
}

function decalerElectro(n) {
  const b = _elecBornes(_electroRef);
  const ref = new Date(b.lundi); ref.setDate(ref.getDate() + 7 * n);
  _electroRef = ref;
  renderElectro();
}
function retourElectroSemaine() { _electroRef = null; renderElectro(); }

/** Aperçu à l'écran (carte de l'Historique). */
async function renderElectro() {
  const zone = document.getElementById('electro-apercu');
  const lbl = document.getElementById('electro-week-label');
  if (!zone) return;
  const b = _elecBornes(_electroRef);
  if (lbl) lbl.textContent = _elecLibelleSemaine(b);

  zone.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px">Chargement…</p>';
  const recs = await _elecDossiers(_electroRef);
  // La semaine a pu changer pendant le chargement (clic rapide).
  const b2 = _elecBornes(_electroRef);
  if (b2.du !== b.du) return;

  const lignes = recs.map(_elecLigne);
  if (!lignes.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px">Aucune électrophorèse à faire cette semaine.</p>';
    return;
  }
  const corps = lignes.map(l =>
    '<tr><td style="font-family:monospace;white-space:nowrap">' + esc(l.dossier) + '</td>'
    + '<td><strong>' + esc(l.nom) + '</strong></td>'
    + '<td style="text-align:center">' + (l.groupe ? esc(l.groupe) : '<span style="color:var(--text-muted)">—</span>') + '</td></tr>').join('');
  zone.innerHTML =
    '<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px"><strong style="color:var(--text-label);font-size:15px">'
    + lignes.length + '</strong> électrophorèse(s) à faire</div>'
    + '<div class="table-wrap"><table class="result-table" style="width:100%;font-size:12.5px">'
    + '<thead><tr><th>N° dossier</th><th>Nom</th><th style="text-align:center">Groupe</th></tr></thead>'
    + '<tbody>' + corps + '</tbody></table></div>';
}

/** Construit la fiche imprimable (A4, tailles du compte rendu) et imprime. */
async function imprimerElectro() {
  const b = _elecBornes(_electroRef);
  showLoading('Préparation de la liste…');
  const recs = await _elecDossiers(_electroRef);
  hideLoading();
  const lignes = recs.map(_elecLigne);

  const corps = lignes.length
    ? lignes.map(l =>
        '<tr><td class="el-no">' + esc(l.dossier) + '</td>'
        + '<td class="el-nom">' + esc(l.nom) + '</td>'
        + '<td class="el-grp">' + esc(l.groupe) + '</td>'
        + '<td class="el-el"></td></tr>').join('')
    : '<tr><td colspan="4" style="text-align:center;font-style:italic">Aucune électrophorèse à faire cette semaine.</td></tr>';

  const html =
    '<style>'
    + '@page{size:A4;margin:12mm 10mm;}'
    + '#print-render::after,#print-render::before,body::after,body::before{content:none!important;display:none!important;}'
    + "#print-render{font-family:'Segoe UI',Arial,sans-serif;color:#000;background:#fff;}"
    + '.el-h1{font-size:13.5pt;font-weight:800;text-align:center;letter-spacing:.3px;margin:0;}'
    + '.el-h2{font-size:7pt;color:#333;text-align:center;margin:1px 0 0;}'
    + '.el-title{font-size:11pt;font-weight:800;text-align:center;letter-spacing:.4px;margin-top:8px;padding-bottom:5px;border-bottom:1.3pt solid #111;}'
    + '.el-band{border:1px solid #444;background:#eee;font-weight:700;font-size:10pt;padding:4px 10px;margin:12px 0 6px;}'
    + '.el-t{width:100%;border-collapse:collapse;font-size:9pt;}'
    + '.el-t th,.el-t td{border:1px solid #999;padding:5px 8px;}'
    + '.el-t th{background:#eee;font-weight:700;text-align:left;font-size:9pt;}'
    + '.el-t tbody td{height:40px;vertical-align:middle;}'
    + '.el-t tr{page-break-inside:avoid;}'
    + '.el-no{width:18%;white-space:nowrap;}.el-nom{width:40%;font-weight:600;}'
    + '.el-grp{width:14%;text-align:center;font-weight:700;white-space:nowrap;}.el-el{width:28%;}'
    + '.el-foot{margin-top:16px;padding-top:4px;border-top:1.4px solid #333;display:flex;gap:14px;}'
    + '.el-foot>div{flex:1;}.el-sig-lab{font-size:8pt;font-weight:700;}.el-sigbox{border:1px solid #666;height:12mm;margin-top:2px;}'
    + '</style>'
    + '<div class="el-h1">CPMI DE GRAND-BASSAM</div>'
    + '<div class="el-h2">Centre de Protection Mère et Infantile · Laboratoire d\'analyses médicales · Grand-Bassam, Côte d\'Ivoire</div>'
    + '<div class="el-title">ÉLECTROPHORÈSE</div>'
    + '<div class="el-band">' + esc(_elecLibelleSemaine(b)) + ' · ' + lignes.length + ' à faire</div>'
    + '<table class="el-t"><thead><tr>'
    + '<th class="el-no">N° dossier</th><th class="el-nom">Nom</th><th class="el-grp">Groupe</th><th class="el-el">Électrophorèse</th>'
    + '</tr></thead><tbody>' + corps + '</tbody></table>'
    + '<div class="el-foot">'
    + '<div><div class="el-sig-lab">Le technicien</div><div class="el-sigbox"></div></div>'
    + '<div><div class="el-sig-lab">Visa du responsable</div><div class="el-sigbox"></div></div>'
    + '</div>';

  let printDiv = document.getElementById('print-render');
  if (!printDiv) { printDiv = document.createElement('div'); printDiv.id = 'print-render'; document.body.appendChild(printDiv); }
  printDiv.innerHTML = html;
  window.print();
}

/* ═══════════════════════════════════════════════════════════════
   LaboSaisie Client 1 — tdr.js

   ✅ v13.252 — « TDR paludisme » : liste des TDR de la semaine (ou du mois),
   sur le modèle de l'électrophorèse, pour les relever et les transmettre.

   • Un TDR est FAIT quand son résultat est saisi (Hématologie → « GE - TDR »,
     ou l'ancien onglet Parasitologie → « TDR paludisme »).
   • Un TDR demandé (« TDR Paludisme » coché) sans résultat est À SAISIR : on
     peut entrer Positif / Négatif directement depuis la liste, ce qui remplit
     le dossier (comme le profil d'électrophorèse).
   • On coche les lignes à imprimer (toutes les faites le sont par défaut) ;
     la feuille A4 reprend, pour chaque patient : n°, n° de dossier,
     nom, âge, sexe, résultat du TDR — et un récapitulatif.
   • ✅ v13.264 — Ni prescripteur ni date sur la liste des TDR (écran et
     feuille) ; la période reste indiquée dans le bandeau de la feuille.

   Chargé en script classique après electrophorese.js, dont il réutilise les
   bornes de semaine (_elecBornes, _elecLibelleSemaine). Réutilise aussi :
   _dbCache, _recDate, ensureFull, updateRecordRemote, esc, formatAge,
   showLoading/hideLoading, toast.
   ═══════════════════════════════════════════════════════════════ */

let _tdrRef = null;                 // date quelconque dans la période voulue (null = courante)
let _tdrMode = 'semaine';           // 'semaine' | 'mois'
let _tdrHorsImpression = new Set(); // lignes DÉcochées pour l'impression (le temps de la session)
let _tdrRendu = 0;                  // n° du dernier affichage demandé (réponses tardives ignorées)

function toggleTdrImprimer(id, val) {
  if (val) _tdrHorsImpression.delete(String(id)); else _tdrHorsImpression.add(String(id));
}
function tdrToutCocher(val) {
  document.querySelectorAll('#tdr-apercu input[data-tdr-imp]').forEach(cb => {
    cb.checked = !!val; toggleTdrImprimer(cb.dataset.tdrImp, !!val);
  });
}

function _tdrBornes(ref) {
  if (_tdrMode === 'mois') {
    const d = new Date(ref || new Date());
    const debut = new Date(d.getFullYear(), d.getMonth(), 1);
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const libelle = debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return { debut, du: _elecJourLocal(debut), au: _elecJourLocal(fin),
             libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1) };
  }
  const b = _elecBornes(ref);
  return { debut: b.lundi, du: b.du, au: b.au, libelle: _elecLibelleSemaine(b) };
}

// TDR demandé dans le dossier ? (« TDR Paludisme » ; l'ancien libellé fusionné
// « Goutte épaisse / TDR Paludisme » compte aussi, mais seulement s'il a un résultat).
function _tdrDemande(res) {
  const c = (res && res._examens_coches) || {};
  return Object.values(c).some(arr => (arr || []).some(l => /^TDR/i.test(String(l))));
}
function _tdrMentionne(res) {
  const c = (res && res._examens_coches) || {};
  return Object.values(c).some(arr => (arr || []).some(l => /TDR/i.test(String(l))));
}
function _tdrResultat(res) {
  const h = (res && res['Hématologie']) || {}, p = (res && res['Parasitologie']) || {};
  return String(h['GE - TDR'] || p['TDR paludisme'] || '').trim();
}
// Âge en années (« 18 mois » → 1,5 ; « 10 jours » → 0,03), null si inconnu.
function _tdrAgeAns(age) {
  const s = String(age == null ? '' : age).trim().toLowerCase();
  const n = parseFloat(s.replace(',', '.'));
  if (isNaN(n)) return null;
  if (/mois/.test(s)) return n / 12;
  if (/jour|\bj\b/.test(s)) return n / 365;
  return n;
}

// Dossiers de la période : TDR fait (résultat saisi) ou à saisir (demandé, sans résultat).
async function _tdrDossiers(ref) {
  const b = _tdrBornes(ref);
  const toutes = (typeof _dbCache !== 'undefined' ? _dbCache : []) || [];
  const candidats = toutes.filter(r =>
    !r.deletedAt && !r._hardDeleted
    && _recDate(r) >= b.du && _recDate(r) <= b.au
    && _tdrMentionne(r.resultats));
  if (typeof ensureFull === 'function') {
    try { await Promise.all(candidats.map(r => ensureFull(r))); } catch (e) { /* réseau : garder l'existant */ }
  }
  return candidats
    .filter(r => _tdrResultat(r.resultats) || _tdrDemande(r.resultats))
    .sort((a, b2) => (_recDate(a) + (a.savedAt || '')).localeCompare(_recDate(b2) + (b2.savedAt || '')));
}

function _tdrLigne(r) {
  const p = r.patient || {};
  return {
    id: r.id,
    dossier: p.dossier || p.ancien_dossier || '—',
    nom: p.nom || '—',
    age: typeof formatAge === 'function' ? formatAge(p.age) : String(p.age || ''),
    ageAns: _tdrAgeAns(p.age),
    sexe: p.sexe || '',
    tdr: _tdrResultat(r.resultats),
    masque: !!r.restrictedBy,
  };
}
function _tdrBadge(v) {
  if (!v) return '<span style="color:var(--text-muted)">—</span>';
  const pos = /posit/i.test(v);
  return '<span style="font-weight:700;border-radius:4px;padding:1px 7px;font-size:11.5px;'
    + (pos ? 'background:#fee2e2;color:#b91c1c' : 'background:#dcfce7;color:#15803d') + '">' + esc(v) + '</span>';
}
function _tdrRecap(lignes) {
  const faits = lignes.filter(l => l.tdr);
  const pos = faits.filter(l => /posit/i.test(l.tdr));
  const moins5 = faits.filter(l => l.ageAns != null && l.ageAns < 5);
  return { total: faits.length, positifs: pos.length, negatifs: faits.length - pos.length,
           moins5: moins5.length, moins5Pos: moins5.filter(l => /posit/i.test(l.tdr)).length };
}

// Résultat saisi depuis la liste → écrit dans le dossier (Hématologie → GE - TDR).
async function enregistrerTdrResultat(id) {
  const rec = (typeof _dbCache !== 'undefined' ? _dbCache : []).find(r => r.id === id);
  if (!rec) { toast('Dossier introuvable', 'err'); return; }
  const sel = document.getElementById('tdr-res-' + id);
  const val = sel ? sel.value : '';
  if (!val) { toast('Choisissez Positif ou Négatif', 'err'); return; }
  showLoading('Enregistrement du TDR…');
  try { if (typeof ensureFull === 'function') await ensureFull(rec); } catch (e) {}
  if (rec._light) { hideLoading(); toast('Impossible hors-ligne — réessayez connecté', 'err'); return; }
  // Copie : le cache n'est modifié qu'une fois le serveur d'accord (updateRecordRemote
  //   le remplace alors) — un refus (journée verrouillée…) ne laisse pas un faux
  //   « fait » dans la liste ni sur la feuille imprimée.
  const res = rec.resultats || {};
  const copie = Object.assign({}, rec, { resultats: Object.assign({}, res, {
    'Hématologie': Object.assign({}, res['Hématologie'] || {}, { 'GE - TDR': val }) }) });
  const updated = await updateRecordRemote(id, copie, { onlyResultats: true });
  hideLoading();
  if (updated) { toast('TDR enregistré ✓ (' + val + ')', 'ok'); renderTdr(); }
}

function decalerTdr(n) {
  const b = _tdrBornes(_tdrRef);
  const ref = new Date(b.debut);
  if (_tdrMode === 'mois') ref.setMonth(ref.getMonth() + n); else ref.setDate(ref.getDate() + 7 * n);
  _tdrRef = ref;
  renderTdr();
}
function retourTdrPeriode() { _tdrRef = null; renderTdr(); }
function setTdrMode(m) {
  _tdrMode = m === 'mois' ? 'mois' : 'semaine';
  document.querySelectorAll('[data-tdr-mode]').forEach(b => {
    const on = b.dataset.tdrMode === _tdrMode;
    b.classList.toggle('btn-primary', on); b.classList.toggle('btn-outline', !on);
  });
  renderTdr();
}

/** Aperçu à l'écran (carte de l'Historique). */
async function renderTdr() {
  const zone = document.getElementById('tdr-apercu');
  const lbl = document.getElementById('tdr-periode-label');
  if (!zone) return;
  const b = _tdrBornes(_tdrRef);
  if (lbl) lbl.textContent = b.libelle;
  zone.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px">Chargement…</p>';
  const jeton = ++_tdrRendu;
  const recs = await _tdrDossiers(_tdrRef);
  // Période OU mode changé pendant le chargement (une semaine et un mois peuvent
  //   commencer le même jour) : seul le dernier affichage demandé s'écrit.
  if (jeton !== _tdrRendu) return;

  const lignes = recs.map(_tdrLigne);
  if (!lignes.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:8px">Aucun TDR sur cette période.</p>';
    return;
  }
  const rc = _tdrRecap(lignes), aSaisir = lignes.filter(l => !l.tdr).length;
  const corps = lignes.map(l => {
    const fait = !!l.tdr;
    const imprimer = fait && !_tdrHorsImpression.has(String(l.id));
    return '<tr' + (fait ? '' : ' style="background:#fffbeb"') + '>'
      + '<td style="text-align:center">' + (fait
          ? '<input type="checkbox" data-tdr-imp="' + l.id + '" ' + (imprimer ? 'checked' : '')
            + ' onchange="toggleTdrImprimer(' + l.id + ',this.checked)" title="Inclure dans l\'impression" style="width:16px;height:16px;cursor:pointer">'
          : '') + '</td>'
      + '<td style="font-family:monospace;white-space:nowrap">' + esc(l.dossier) + '</td>'
      + '<td><strong>' + esc(l.nom) + '</strong>' + (l.masque ? ' <span title="Fiche masquée" style="font-size:11px">🔒</span>' : '') + '</td>'
      + '<td style="white-space:nowrap">' + esc(l.age || '—') + '</td>'
      + '<td style="text-align:center">' + esc(l.sexe || '—') + '</td>'
      + '<td style="white-space:nowrap">' + (fait ? _tdrBadge(l.tdr)
          : '<select id="tdr-res-' + l.id + '" style="font-size:12px;padding:3px 6px"><option value="">— À saisir —</option>'
            + '<option>Positif</option><option>Négatif</option></select> '
            + '<button class="btn btn-success" style="padding:3px 9px;font-size:11px" onclick="enregistrerTdrResultat(' + l.id + ')" '
            + 'title="Enregistrer le résultat dans le dossier">✓ Enregistrer</button>') + '</td>'
      + '</tr>';
  }).join('');
  zone.innerHTML =
    '<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px">'
    + '<strong style="color:var(--text-label);font-size:15px">' + rc.total + '</strong> TDR fait(s) · '
    + '<span style="color:#b91c1c;font-weight:700">' + rc.positifs + ' positif(s)</span> · '
    + '<span style="color:#15803d;font-weight:700">' + rc.negatifs + ' négatif(s)</span>'
    + (rc.moins5 ? ' · moins de 5 ans : ' + rc.moins5 + ' (dont ' + rc.moins5Pos + ' positif(s))' : '')
    + (aSaisir ? ' · <strong style="color:#b45309">' + aSaisir + ' à saisir</strong> (surlignés)' : '')
    + '<br>Cochez les TDR à imprimer, puis « 🖨 Imprimer ». '
    + '<a href="#" onclick="tdrToutCocher(true);return false">Tout cocher</a> · '
    + '<a href="#" onclick="tdrToutCocher(false);return false">Tout décocher</a></div>'
    + '<div class="table-wrap"><table class="result-table" style="width:100%;font-size:12.5px">'
    + '<thead><tr><th style="text-align:center">Imprimer</th><th>N° dossier</th><th>Nom</th>'
    + '<th>Âge</th><th style="text-align:center">Sexe</th><th>TDR</th></tr></thead>'
    + '<tbody>' + corps + '</tbody></table></div>';
}

/** Feuille A4 des TDR cochés, avec récapitulatif, puis impression. */
async function imprimerTdr() {
  const b = _tdrBornes(_tdrRef);
  showLoading('Préparation de la liste des TDR…');
  const recs = await _tdrDossiers(_tdrRef);
  hideLoading();
  const lignes = recs.map(_tdrLigne).filter(l => l.tdr && !_tdrHorsImpression.has(String(l.id)));
  if (!lignes.length) { toast('Aucun TDR coché à imprimer', 'err'); return; }
  const rc = _tdrRecap(lignes);
  const corps = lignes.map((l, i) =>
    '<tr><td class="td-n">' + (i + 1) + '</td>'
    + '<td class="td-no">' + esc(l.dossier) + '</td>'
    + '<td class="td-nom">' + esc(l.nom) + '</td>'
    + '<td class="td-age">' + esc(l.age) + '</td>'
    + '<td class="td-sx">' + esc(l.sexe) + '</td>'
    + '<td class="td-res">' + esc(l.tdr) + '</td></tr>').join('');

  const html =
    '<style>'
    + '@page{size:A4;margin:12mm 10mm;}'
    + '#print-render::after,#print-render::before,body::after,body::before{content:none!important;display:none!important;}'
    + "#print-render{font-family:'Segoe UI',Arial,sans-serif;color:#000;background:#fff;}"
    + '.td-h1{font-size:13.5pt;font-weight:800;text-align:center;letter-spacing:.3px;margin:0;}'
    + '.td-h2{font-size:7pt;color:#333;text-align:center;margin:1px 0 0;}'
    + '.td-title{font-size:11pt;font-weight:800;text-align:center;letter-spacing:.4px;margin-top:8px;padding-bottom:5px;border-bottom:1.3pt solid #111;}'
    + '.td-band{border:1px solid #444;background:#eee;font-weight:700;font-size:9.5pt;padding:4px 10px;margin:10px 0 6px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;}'
    + '.td-t{width:100%;border-collapse:collapse;font-size:9pt;}'
    + '.td-t th,.td-t td{border:1px solid #999;padding:4px 6px;vertical-align:middle;}'
    + '.td-t th{background:#eee;font-weight:700;text-align:left;}'
    + '.td-t tr{page-break-inside:avoid;}'
    + '.td-n{width:5%;text-align:center;}.td-no{width:15%;white-space:nowrap;}'
    + '.td-nom{width:46%;font-weight:600;}.td-age{width:12%;white-space:nowrap;}.td-sx{width:7%;text-align:center;}'
    + '.td-res{width:15%;font-weight:800;}'
    + '.td-foot{margin-top:14px;padding-top:4px;border-top:1.4px solid #333;display:flex;gap:14px;}'
    + '.td-foot>div{flex:1;}.td-sig-lab{font-size:8pt;font-weight:700;}.td-sigbox{border:1px solid #666;height:12mm;margin-top:2px;}'
    + '</style>'
    + '<div class="td-h1">LABORATOIRE CLIENT 1</div>'
    + '<div class="td-h2">Laboratoire d\'analyses médicales, Côte d\'Ivoire</div>'
    + '<div class="td-title">TDR PALUDISME RÉALISÉS</div>'
    + '<div class="td-band"><span>' + esc(b.libelle) + '</span>'
    + '<span>Total : ' + rc.total + ' · Positifs : ' + rc.positifs + ' · Négatifs : ' + rc.negatifs
    + ' · Moins de 5 ans : ' + rc.moins5 + ' (dont ' + rc.moins5Pos + ' positif(s))</span></div>'
    + '<table class="td-t"><thead><tr>'
    + '<th class="td-n">N°</th><th class="td-no">N° dossier</th><th class="td-nom">Nom et prénoms</th>'
    + '<th class="td-age">Âge</th><th class="td-sx">Sexe</th>'
    + '<th class="td-res">Résultat TDR</th>'
    + '</tr></thead><tbody>' + corps + '</tbody></table>'
    + '<div class="td-foot">'
    + '<div><div class="td-sig-lab">Le technicien</div><div class="td-sigbox"></div></div>'
    + '<div><div class="td-sig-lab">Reçu par</div><div class="td-sigbox"></div></div>'
    + '</div>';

  let printDiv = document.getElementById('print-render');
  if (!printDiv) { printDiv = document.createElement('div'); printDiv.id = 'print-render'; document.body.appendChild(printDiv); }
  printDiv.innerHTML = html;
  window.print();
}

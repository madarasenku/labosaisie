/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — registre-jour.js

   ✅ v13.169 — « Registre du jour » : une ligne par patient de la
   journée (dossier · patient · prescripteur · examens · résultat ·
   prix), imprimable en A4 noir & blanc, à côté de la clôture de caisse.

   C'est un document CLINIQUE/opérationnel, distinct de la clôture
   (qui, elle, est financière). Il reprend la synthèse courte des
   résultats, SANS interprétation couleur : en impression N&B, seule
   la valeur compte.

   Chargé en script classique (après cloture-caisse.js) — voir le
   commentaire d'index.html. Réutilise les helpers globaux :
   _jourLocal, _fcfa (cloture-caisse.js), _recDate (session-pwa.js),
   formatAge (donnees-analyses.js), esc (supabase-db.js), ensureFull
   (supabase-db.js), les classes d'impression .print-* (css/app.css).
   ═══════════════════════════════════════════════════════════════ */

// Montant compact pour une colonne de tableau (« 3 000 »), sans « FCFA ».
function _regMontant(n) { return (Number(n) || 0).toLocaleString('fr-FR'); }

// Valeur non vide d'un paramètre { valeur, unite, interp } ou chaîne.
function _regVal(x) {
  if (x == null) return '';
  if (typeof x === 'object') return String(x.valeur ?? '').trim();
  return String(x).trim();
}
// Pourcentage d'une sous-population leucocytaire (normalise « 03 » → « 3 »).
function _regPct(x) {
  const p = (x && typeof x === 'object') ? String(x.pct ?? '').trim() : '';
  if (p === '') return '';
  return /^[0-9]+$/.test(p) ? String(parseInt(p, 10)) : p;
}

// Libellé court d'un examen coché (« NFS — Numération… » → « NFS »).
function _regShortExam(lab) {
  const l = String(lab || '');
  if (/^NFS/i.test(l)) return 'NFS';
  if (/^Goutte/i.test(l)) return 'GE/TDR';
  if (/^CRP/i.test(l)) return 'CRP';
  if (/^Glyc/i.test(l)) return 'Glycémie';
  if (/^Urée$/i.test(l)) return 'Urée';
  if (/^Créat/i.test(l)) return 'Créat';
  if (/^HbA1c/i.test(l)) return 'HbA1c';
  if (/^Groupe sanguin/i.test(l)) return 'Groupe';
  if (/^Électro/i.test(l)) return 'Électrophorèse Hb';
  if (/^Ag HBs/i.test(l)) return 'Ag HBs';
  if (/^TPHA/i.test(l)) return 'TPHA/VDRL';
  if (/^Toxo/i.test(l)) return 'Toxo';
  if (/^Rubéole/i.test(l)) return 'Rubéole';
  if (/^Widal/i.test(l)) return 'Widal';
  return l;
}

// Liste des examens d'un dossier (forfait prénatal regroupé).
function _regExamens(res) {
  const coches = (res && res._examens_coches) || {};
  const labels = [];
  Object.values(coches).forEach(arr => (arr || []).forEach(l => labels.push(l)));
  if (labels.some(l => /pr[ée]natal/i.test(String(l)))) return 'Bilan prénatal (forfait)';
  const shorts = [];
  labels.forEach(l => { const s = _regShortExam(l); if (!shorts.includes(s)) shorts.push(s); });
  return shorts.join(' · ');
}

// Noms compacts pour le registre (les longs libellés canoniques sont abrégés).
const _REG_SHORT = {
  'Globules blancs (GB)': 'GB', 'Globules rouges (GR)': 'GR', 'Hémoglobine (Hb)': 'Hb',
  'Hématocrite (Ht)': 'Ht', 'VGM ⚙': 'VGM', 'TCMH ⚙': 'TCMH', 'CCMH ⚙': 'CCMH',
  'Plaquettes': 'Plq', 'Réticulocytes': 'Rét', 'VS (1ère heure)': 'VS',
  'Polynucléaires neutrophiles (PNN)': 'PNN', 'Polynucléaires éosinophiles (PNE)': 'PNE',
  'Polynucléaires basophiles (PNB)': 'PNB', 'Lymphocytes': 'Lympho', 'Monocytes': 'Mono',
  'TPHA / VDRL (Syphilis)': 'TPHA/VDRL', 'ASLO (Antistreptolysines)': 'ASLO',
  'Latex (Waaler-Rose)': 'Latex', 'Toxoplasmose IgG': 'Toxo IgG', 'Toxoplasmose IgM': 'Toxo IgM',
};
function _regNom(name) { return _REG_SHORT[name] || String(name).replace(/\s*⚙\s*$/, ''); }

// Synthèse COMPLÈTE des résultats saisis — toutes les valeurs (NFS, GE, biochimie,
// sérologies, groupe…), sans couleur ni flèche (le registre est un document N&B).
// La GE positive affiche directement sa valeur (densité · parasitémie · espèce).
function _regSynthese(res) {
  if (!res) return '';
  const h = res['Hématologie'] || {}, s = res['Immuno-Sérologie'] || {},
        b = res['Biochimie'] || {}, g = res['Groupe sanguin'] || {};
  const parts = [];

  // ── GE / paludisme : valeur directe quand POSITIF ──
  const ge = _regVal(h['GE - Résultat']);
  if (ge) {
    if (/posit/i.test(ge)) {
      const dens = _regVal(h['GE - Densité parasitaire (/µL)']);
      const para = _regVal(h['GE - Parasitémie (%)']);
      const esp  = _regVal(h['GE - Espèce']);
      const det = [dens ? dens + '/µL' : '', para ? para + '%' : '', esp].filter(Boolean).join(' · ');
      parts.push('GE POSITIF' + (det ? ' (' + det + ')' : ''));
    } else parts.push('GE ' + ge.toLowerCase());
  }
  const tdr = _regVal(h['GE - TDR']);
  if (tdr) parts.push('TDR ' + tdr.toLowerCase());

  // ── NFS complète ──
  (typeof HEMA_PARAMS !== 'undefined' ? HEMA_PARAMS : []).forEach(p => {
    const v = _regVal(h[p.name]); if (v) parts.push(_regNom(p.name) + ' ' + v);
  });
  (typeof HEMA_FL !== 'undefined' ? HEMA_FL : []).forEach(p => {
    const pct = _regPct(h[p.name]); if (pct !== '') parts.push(_regNom(p.name) + ' ' + pct + '%');
  });
  const prof = _regVal(h['Profil Hb']); if (prof) parts.push('Électrophorèse ' + prof);

  // ── Biochimie complète (toutes les familles) ──
  const bioAll = [].concat(
    typeof BIO_GLUCIDES !== 'undefined' ? BIO_GLUCIDES : [],
    typeof BIO_REIN     !== 'undefined' ? BIO_REIN     : [],
    typeof BIO_FOIE     !== 'undefined' ? BIO_FOIE     : [],
    typeof BIO_LIPIDES  !== 'undefined' ? BIO_LIPIDES  : [],
    typeof BIO_IONO     !== 'undefined' ? BIO_IONO     : [],
    typeof BIO_FER      !== 'undefined' ? BIO_FER      : [],
    typeof BIO_CARD     !== 'undefined' ? BIO_CARD     : [],
    typeof BIO_HORM     !== 'undefined' ? BIO_HORM     : [],
    typeof BIO_COAG     !== 'undefined' ? BIO_COAG     : [],
    typeof BIO_AUTRE    !== 'undefined' ? BIO_AUTRE    : []);
  bioAll.forEach(p => {
    const v = _regVal(b[p.name]); if (v) parts.push(_regNom(p.name) + ' ' + v + (p.unit ? ' ' + p.unit : ''));
  });

  // ── CRP : valeur directe, négatif → « < 6 mg/L » ──
  const crp = _regVal(s['CRP - Valeur']);
  if (crp) parts.push(/^neg/i.test(crp) ? 'CRP < 6 mg/L' : 'CRP ' + crp + ' mg/L');

  // ── Sérologies (résultat qualitatif ou valeur chiffrée) ──
  (typeof SERO_TESTS !== 'undefined' ? SERO_TESTS : []).forEach(t => {
    const x = s[t.name]; if (!x || typeof x !== 'object') return;
    const val = String(x.resultat || x.valeur || '').trim();
    if (val) parts.push(_regNom(t.name) + ' ' + val + (x.valeur && x.unite ? ' ' + x.unite : ''));
  });

  // ── Widal : antigènes significatifs (titre renseigné, hors « Non réalisé ») ──
  if (typeof WIDAL_ANTIGENES !== 'undefined') {
    WIDAL_ANTIGENES.forEach(ag => {
      const w = s['Widal - ' + ag.name];
      const titre = w && String(w.titre || '').trim();
      if (titre && titre !== 'Non réalisé' && titre !== 'Négatif') {
        parts.push('Widal ' + ag.name.replace(/^Salmonella\s+/i, '').replace(/\s*\(.*\)$/, '') + ' ' + titre);
      }
    });
  }

  // ── Groupe sanguin ──
  const abo = _regVal(g['Groupe ABO']);
  if (abo) {
    const rh = _regVal(g['Rhésus']);
    parts.push('Gpe ' + abo + (rh === 'Positif' ? '+' : rh === 'Négatif' ? '−' : ''));
  }
  return parts.join(' · ');
}

// Dossiers actifs de la journée (exclut corbeille et fiches masquées),
// triés par heure de saisie — l'ordre d'arrivée des patients.
function _regDossiersDuJour(jour) {
  const toutes = (typeof _dbCache !== 'undefined' ? _dbCache : []) || [];
  return toutes
    .filter(r => !r.deletedAt && !r._hardDeleted && !r.restrictedBy && _recDate(r) === jour)
    .sort((a, b) => String(a.savedAt || '').localeCompare(String(b.savedAt || '')));
}

// Un dossier est-il prescrit par un PRESCRIPTEUR EXTERNE (hors CPMI) ?
//   Interne = structure CPMI (ou un service CPMI : Maternité…). Externe = tout
//   autre établissement (hôpital, clinique, cabinet privé) ou le prescripteur
//   catch-all « EXTERNE ». On rattache le dossier à son prescripteur par id
//   (sinon par nom), via la liste chargée _prescripteurs.
function _prescExterne(r) {
  const p = r.patient || {};
  if (/^externe$/i.test(String(p.medecin || '').trim())) return true;
  const list = (typeof _prescripteurs !== 'undefined' && Array.isArray(_prescripteurs)) ? _prescripteurs : [];
  let presc = null;
  if (r.prescripteur_id != null) presc = list.find(x => x.id == r.prescripteur_id);
  if (!presc && p.medecin) presc = list.find(x => String(x.nom).trim().toUpperCase() === String(p.medecin).trim().toUpperCase());
  if (!presc) return false;                       // prescripteur inconnu → pas de faux positif
  if (/^externe$/i.test(String(presc.nom || '').trim())) return true;
  const struct = String(presc.structure || '').trim();
  if (!struct) return false;                       // structure non renseignée → indéterminé
  return !/CPMI|MATERNIT/i.test(struct);           // structure hors CPMI → externe
}

// Ligne de registre à partir d'un dossier (résultats déjà chargés en entier).
function _regLigne(r) {
  const p = r.patient || {};
  const synthese = _regSynthese(r.resultats);
  const metaParts = [];
  if (p.sexe) metaParts.push(p.sexe);
  if (p.age !== undefined && p.age !== '' && p.age != null) metaParts.push(formatAge(p.age));
  return {
    dossier: p.dossier || p.ancien_dossier || '—',
    nom: p.nom || '—',
    meta: metaParts.join(' · '),
    presc: p.medecin || '—',
    examens: _regExamens(r.resultats) || '—',
    synthese,
    rendu: synthese !== '',
    montant: Number(r.montant) || 0,
    // ✅ Prescripteur externe (hors CPMI) → ligne colorée dans le registre.
    externe: _prescExterne(r),
    // ✅ Poste (labo 24h/24) d'après l'heure d'enregistrement : Permanence / Garde.
    poste: (typeof posteDossier === 'function') ? posteDossier(r) : '',
  };
}

// Charge le détail complet des dossiers du jour (le cache est « light »).
async function _regChargerJour(jour) {
  const recs = _regDossiersDuJour(jour);
  if (typeof ensureFull === 'function') {
    try { await Promise.all(recs.map(r => ensureFull(r))); } catch (e) { /* réseau : on garde ce qu'on a */ }
  }
  return recs;
}

// ✅ v13.210 — Impression du registre depuis le bouton en haut de l'historique.
//   Utilise le jour choisi dans le petit sélecteur (ou aujourd'hui par défaut).
// ✅ v13.212 — Robuste : on charge d'abord les dossiers si le cache est vide, et
//   toute erreur est signalée (plus d'échec silencieux « rien ne se passe »).
async function imprimerRegistreDepuisHistorique() {
  try {
    const d = document.getElementById('hist-registre-date');
    const jour = (d && d.value) || _jourLocal();
    if (d && !d.value) d.value = jour;
    if ((typeof _dbCache === 'undefined' || !Array.isArray(_dbCache) || !_dbCache.length)
        && typeof refreshDB === 'function') {
      try { await refreshDB(); } catch (e) {}
    }
    if (typeof imprimerRegistre !== 'function') { if (typeof toast === 'function') toast('Impression indisponible', 'err'); return; }
    await imprimerRegistre(jour);
  } catch (e) {
    if (typeof toast === 'function') toast('Impression du registre impossible : ' + (e && e.message || e), 'err');
  }
}

/** Aperçu à l'écran, avant impression. */
async function renderRegistre() {
  const zone = document.getElementById('registre-apercu');
  const champ = document.getElementById('registre-date');
  if (!zone) return;
  if (champ && !champ.value) champ.value = _jourLocal();
  const jour = (champ && champ.value) || _jourLocal();

  zone.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:10px">Chargement des résultats…</p>';
  const recs = await _regChargerJour(jour);
  // La date a pu changer pendant le chargement (clic rapide) : ne pas écraser.
  if (champ && champ.value && champ.value !== jour) return;

  const lignes = recs.map(_regLigne);
  const rendus = lignes.filter(l => l.rendu).length;
  const recette = lignes.reduce((s, l) => s + l.montant, 0);
  const nPerm = lignes.filter(l => l.poste === 'Permanence').length;
  const nGarde = lignes.length - nPerm;
  const jourLong = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (!lignes.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:10px">'
      + 'Aucun dossier le ' + esc(jourLong) + '.</p>';
    return;
  }

  // ✅ v13.231 — Aperçu SÉPARÉ par poste (comme à l'impression) : une section
  //   « Permanence » puis une section « Garde », chacune avec son propre tableau
  //   et son total. Plus de colonne Poste (chaque tableau ne contient qu'un poste).
  const corpsPrev = (arr) => arr.map(l =>
    '<tr' + (l.externe ? ' style="background:#fff5e0"' : '') + '>'
    + '<td style="font-family:monospace;white-space:nowrap">' + esc(l.dossier) + '</td>'
    + '<td><strong>' + esc(l.nom) + '</strong>' + (l.meta ? ' <span style="color:var(--text-muted);font-size:11px">' + esc(l.meta) + '</span>' : '')
    + (l.externe ? ' <span style="font-size:10px;font-weight:700;color:#b45309;background:#fde7bf;border-radius:4px;padding:1px 5px">EXTERNE</span>' : '') + '</td>'
    + '<td style="color:var(--text-muted)">' + esc(l.presc) + '</td>'
    + '<td style="color:var(--text-muted)">' + (l.rendu ? esc(l.synthese) : '<em>en attente</em>') + '</td>'
    + '<td style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">' + _regMontant(l.montant) + '</td>'
    + '</tr>').join('');

  const sectionPrev = (titre, arr) => {
    if (!arr.length) return '';
    const rec = arr.reduce((s, l) => s + l.montant, 0);
    const rnd = arr.filter(l => l.rendu).length;
    return '<div style="margin-top:14px">'
      + '<div style="font-weight:800;font-size:13.5px;color:var(--cpmi-deep,#065f46);margin-bottom:6px">'
      + titre + ' · <span style="font-weight:600;color:var(--text-muted);font-size:12px">'
      + arr.length + ' patient(s) · ' + rnd + ' rendu(s) · ' + _regMontant(rec) + ' F</span></div>'
      + '<div class="table-wrap"><table class="result-table" style="width:100%;font-size:12px">'
      + '<thead><tr><th>N°</th><th>Patient</th><th>Prescripteur</th><th>Résultat</th><th style="text-align:right">Prix</th></tr></thead>'
      + '<tbody>' + corpsPrev(arr) + '</tbody></table></div></div>';
  };

  const lignesPerm  = lignes.filter(l => l.poste === 'Permanence');
  const lignesGarde = lignes.filter(l => l.poste !== 'Permanence');

  zone.innerHTML =
    '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--text-muted);margin-bottom:4px">'
    + '<span><strong style="color:var(--text-label);font-size:15px">' + lignes.length + '</strong> patient(s)</span>'
    + '<span>☀️ Permanence : <strong style="color:var(--text-label)">' + nPerm + '</strong></span>'
    + '<span>🌙 Garde : <strong style="color:var(--text-label)">' + nGarde + '</strong></span>'
    + '<span><strong style="color:var(--text-label);font-size:15px">' + rendus + '</strong> / ' + lignes.length + ' résultat(s) rendu(s)</span>'
    + '<span><strong style="color:var(--text-label);font-size:15px">' + _regMontant(recette) + '</strong> F</span>'
    + '</div>'
    + sectionPrev('☀️ Registre de permanence', lignesPerm)
    + sectionPrev('🌙 Registre de garde', lignesGarde);
}

/** Construit le registre imprimable (A4, noir & blanc) et lance l'impression.
 *  ✅ v13.210 — Accepte un jour explicite (bouton « Imprimer le registre » en
 *  haut de l'historique) ; à défaut, le champ de la carte registre ou aujourd'hui. */
async function imprimerRegistre(jourArg) {
  const champ = document.getElementById('registre-date');
  const jour = (typeof jourArg === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(jourArg))
    ? jourArg
    : ((champ && champ.value) || _jourLocal());
  showLoading('Préparation du registre…');
  const recs = await _regChargerJour(jour);
  hideLoading();

  const lignes = recs.map(_regLigne);
  const lignesPerm  = lignes.filter(l => l.poste === 'Permanence');
  const lignesGarde = lignes.filter(l => l.poste !== 'Permanence');
  const now = new Date();
  const jourLong = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const editePar = esc((typeof _currentUser !== 'undefined' && _currentUser && _currentUser.username) || '?');

  // ✅ Les lignes « externe » sont surlignées (impression : fond gris clair forcé
  //   via print-color-adjust). Un patient de consultation externe ressort ainsi.
  const _extStyle = 'background:#e9e9e9;-webkit-print-color-adjust:exact;print-color-adjust:exact';

  // Corps d'un registre (sans colonne Poste : chaque registre ne contient qu'un poste).
  const corpsPoste = (arr) => arr.length
    ? arr.map(l =>
        '<tr' + (l.externe ? ' style="' + _extStyle + '"' : '') + '>'
        + '<td style="font-family:monospace;white-space:nowrap">' + esc(l.dossier) + '</td>'
        + '<td><strong>' + esc(l.nom) + '</strong>' + (l.externe ? ' <strong>[EXTERNE]</strong>' : '') + (l.meta ? '<div style="font-size:8.5pt;color:#555">' + esc(l.meta) + '</div>' : '') + '</td>'
        + '<td>' + esc(l.presc) + '</td>'
        + '<td>' + (l.rendu ? esc(l.synthese) : '<em>en attente</em>') + '</td>'
        + '<td style="text-align:right;white-space:nowrap">' + _regMontant(l.montant) + '</td>'
        + '</tr>').join('')
    : '<tr><td colspan="5" style="font-style:italic;text-align:center">Aucun dossier.</td></tr>';

  // ✅ v13.231 — Registre SÉPARÉ par poste : une page « Registre de permanence »
  //   et une page « Registre de garde », chacune avec son en-tête, son total et
  //   ses signatures (document autonome). La colonne Poste disparaît.
  const pagePoste = (titre, arr) => {
    const rec = arr.reduce((s, l) => s + l.montant, 0);
    const rnd = arr.filter(l => l.rendu).length;
    return ''
      + '<div class="print-header-bar"></div>'
      + '<div style="text-align:center;padding:10px 0 4px">'
      + '<div style="font-size:17pt;font-weight:900">CPMI DE GRAND-BASSAM</div>'
      + '<div style="font-size:10pt;color:#444">Laboratoire d\'analyses médicales</div>'
      + '<div style="font-size:14pt;font-weight:800;margin-top:8px;letter-spacing:.5px">' + titre + '</div>'
      + '<div style="font-size:11pt;margin-top:2px">' + esc(jourLong) + '</div></div>'
      + '<div class="print-header-bar bottom"></div>'
      + '<div style="margin-top:10px;font-size:10pt;color:#333;text-align:center">'
      + '<strong>' + arr.length + '</strong> patient(s) · <strong>' + rnd + '</strong> / '
      + arr.length + ' résultat(s) rendu(s) · Recette : <strong>' + _fcfa(rec) + '</strong></div>'
      + '<table class="print-table" style="margin-top:12px;font-size:9.5pt">'
      + '<thead><tr><th>N° dossier</th><th>Patient</th><th>Prescripteur</th>'
      + '<th>Résultat</th><th style="text-align:right">Prix</th></tr></thead>'
      + '<tbody>' + corpsPoste(arr) + '</tbody>'
      + '<tfoot><tr><td colspan="4" style="text-align:right;font-weight:800">TOTAL</td>'
      + '<td style="text-align:right;font-weight:800">' + _fcfa(rec) + '</td></tr></tfoot>'
      + '</table>'
      + '<div class="print-footer" style="margin-top:22px">'
      + '<div class="print-footer-content">'
      + '<div class="print-sig-box"><div class="print-sig-label">Le biologiste / technicien</div><div class="print-sig-zone"></div></div>'
      + '<div class="print-sig-box"><div class="print-sig-label">Le responsable</div><div class="print-sig-zone"></div></div>'
      + '<div class="print-meta">Édité le ' + now.toLocaleDateString('fr-FR')
      + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      + '<br>par ' + editePar + '</div>'
      + '</div>'
      + '<div class="print-confidential">Document interne du laboratoire CPMI Grand-Bassam</div>'
      + '</div>';
  };

  // Permanence d'abord, puis garde ; chaque poste présent sur sa propre page.
  const pages = [];
  if (lignesPerm.length)  pages.push(pagePoste('REGISTRE DE PERMANENCE (☀️ 08h–16h)', lignesPerm));
  if (lignesGarde.length) pages.push(pagePoste('REGISTRE DE GARDE (🌙 16h–08h)', lignesGarde));
  if (!pages.length)      pages.push(pagePoste('REGISTRE DU JOUR', []));

  const html =
    // ✅ v13.200 — Registre du jour imprimé en PAYSAGE (plus de largeur pour la
    //   colonne Résultat). @page ne cible qu'ici : le compte-rendu, qui remplace
    //   ensuite #print-render, retrouve le portrait par défaut (css/app.css).
    '<style>@media print{@page{size:A4 landscape}}</style>'
    + pages.join('<div style="break-before:page;height:0"></div>');

  let printDiv = document.getElementById('print-render');
  if (!printDiv) {
    printDiv = document.createElement('div');
    printDiv.id = 'print-render';
    document.body.appendChild(printDiv);
  }
  printDiv.innerHTML = html;
  window.print();
}

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

// Synthèse courte des résultats — VALEURS SEULES, sans couleur ni flèche.
function _regSynthese(res) {
  if (!res) return '';
  const h = res['Hématologie'] || {}, s = res['Immuno-Sérologie'] || {},
        b = res['Biochimie'] || {}, g = res['Groupe sanguin'] || {};
  const parts = [];
  const push = (label, x, unit) => { const v = _regVal(x); if (v) parts.push(label + ' ' + v + (unit || '')); };
  const pushPct = (label, x) => { const p = _regPct(x); if (p !== '') parts.push(label + ' ' + p + '%'); };

  // GE / paludisme
  const ge = _regVal(h['GE - Résultat']);
  if (ge) parts.push(/posit/i.test(ge) ? 'GE positif' : 'GE ' + ge.toLowerCase());
  // NFS : GB · GR · Hb · Ht · PNN · Mono · Lympho
  push('GB', h['Globules blancs (GB)']);
  push('GR', h['Globules rouges (GR)']);
  push('Hb', h['Hémoglobine (Hb)']);
  push('Ht', h['Hématocrite (Ht)']);
  pushPct('PNN', h['Polynucléaires neutrophiles (PNN)']);
  pushPct('Mono', h['Monocytes']);
  pushPct('Lympho', h['Lymphocytes']);
  // CRP : valeur directe, négatif → « <6 mg/L »
  const crp = _regVal(s['CRP - Valeur']);
  if (crp) parts.push(/^neg/i.test(crp) ? 'CRP < 6 mg/L' : 'CRP ' + crp + ' mg/L');
  // Biochimie
  push('Gly', b['Glycémie à jeun'], ' g/L');
  push('Créat', b['Créatinine'], ' mg/L');
  push('Urée', b['Urée'], ' g/L');
  // Groupe sanguin
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
  const jourLong = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (!lignes.length) {
    zone.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:10px">'
      + 'Aucun dossier le ' + esc(jourLong) + '.</p>';
    return;
  }

  const corps = lignes.map(l =>
    '<tr>'
    + '<td style="font-family:monospace;white-space:nowrap">' + esc(l.dossier) + '</td>'
    + '<td><strong>' + esc(l.nom) + '</strong>' + (l.meta ? ' <span style="color:var(--text-muted);font-size:11px">' + esc(l.meta) + '</span>' : '') + '</td>'
    + '<td style="color:var(--text-muted)">' + esc(l.presc) + '</td>'
    + '<td>' + esc(l.examens) + '</td>'
    + '<td style="color:var(--text-muted)">' + (l.rendu ? esc(l.synthese) : '<em>en attente</em>') + '</td>'
    + '<td style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">' + _regMontant(l.montant) + '</td>'
    + '</tr>').join('');

  zone.innerHTML =
    '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--text-muted);margin-bottom:10px">'
    + '<span><strong style="color:var(--text-label);font-size:15px">' + lignes.length + '</strong> patient(s)</span>'
    + '<span><strong style="color:var(--text-label);font-size:15px">' + rendus + '</strong> / ' + lignes.length + ' résultat(s) rendu(s)</span>'
    + '<span><strong style="color:var(--text-label);font-size:15px">' + _regMontant(recette) + '</strong> F</span>'
    + '</div>'
    + '<div class="table-wrap"><table class="result-table" style="width:100%;font-size:12px">'
    + '<thead><tr><th>N°</th><th>Patient</th><th>Prescripteur</th><th>Examens</th><th>Résultat</th><th style="text-align:right">Prix</th></tr></thead>'
    + '<tbody>' + corps + '</tbody></table></div>';
}

/** Construit le registre imprimable (A4, noir & blanc) et lance l'impression. */
async function imprimerRegistre() {
  const champ = document.getElementById('registre-date');
  const jour = (champ && champ.value) || _jourLocal();
  showLoading('Préparation du registre…');
  const recs = await _regChargerJour(jour);
  hideLoading();

  const lignes = recs.map(_regLigne);
  const rendus = lignes.filter(l => l.rendu).length;
  const recette = lignes.reduce((s, l) => s + l.montant, 0);
  const now = new Date();
  const jourLong = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const corps = lignes.length
    ? lignes.map(l =>
        '<tr>'
        + '<td style="font-family:monospace;white-space:nowrap">' + esc(l.dossier) + '</td>'
        + '<td><strong>' + esc(l.nom) + '</strong>' + (l.meta ? '<div style="font-size:8.5pt;color:#555">' + esc(l.meta) + '</div>' : '') + '</td>'
        + '<td>' + esc(l.presc) + '</td>'
        + '<td>' + esc(l.examens) + '</td>'
        + '<td>' + (l.rendu ? esc(l.synthese) : '<em>en attente</em>') + '</td>'
        + '<td style="text-align:right;white-space:nowrap">' + _regMontant(l.montant) + '</td>'
        + '</tr>').join('')
    : '<tr><td colspan="6" style="font-style:italic;text-align:center">Aucun dossier ce jour.</td></tr>';

  const html =
    '<div class="print-header-bar"></div>'
    + '<div style="text-align:center;padding:10px 0 4px">'
    + '<div style="font-size:17pt;font-weight:900">CPMI DE GRAND-BASSAM</div>'
    + '<div style="font-size:10pt;color:#444">Laboratoire d\'analyses médicales</div>'
    + '<div style="font-size:14pt;font-weight:800;margin-top:8px;letter-spacing:.5px">REGISTRE DU JOUR</div>'
    + '<div style="font-size:11pt;margin-top:2px">' + esc(jourLong) + '</div></div>'
    + '<div class="print-header-bar bottom"></div>'

    + '<div style="margin-top:10px;font-size:10pt;color:#333;text-align:center">'
    + '<strong>' + lignes.length + '</strong> patient(s) · <strong>' + rendus + '</strong> / '
    + lignes.length + ' résultat(s) rendu(s) · Recette : <strong>' + _fcfa(recette) + '</strong></div>'

    + '<table class="print-table" style="margin-top:12px;font-size:9.5pt">'
    + '<thead><tr>'
    + '<th>N° dossier</th><th>Patient</th><th>Prescripteur</th>'
    + '<th>Examens</th><th>Résultat</th><th style="text-align:right">Prix</th>'
    + '</tr></thead><tbody>' + corps + '</tbody>'
    + '<tfoot><tr><td colspan="5" style="text-align:right;font-weight:800">TOTAL</td>'
    + '<td style="text-align:right;font-weight:800">' + _fcfa(recette) + '</td></tr></tfoot>'
    + '</table>'

    + '<div class="print-footer" style="margin-top:22px">'
    + '<div class="print-footer-content">'
    + '<div class="print-sig-box"><div class="print-sig-label">Le biologiste / technicien</div><div class="print-sig-zone"></div></div>'
    + '<div class="print-sig-box"><div class="print-sig-label">Le responsable</div><div class="print-sig-zone"></div></div>'
    + '<div class="print-meta">Édité le ' + now.toLocaleDateString('fr-FR')
    + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    + '<br>par ' + esc((typeof _currentUser !== 'undefined' && _currentUser && _currentUser.username) || '?') + '</div>'
    + '</div>'
    + '<div class="print-confidential">Document interne du laboratoire CPMI Grand-Bassam</div>'
    + '</div>';

  let printDiv = document.getElementById('print-render');
  if (!printDiv) {
    printDiv = document.createElement('div');
    printDiv.id = 'print-render';
    document.body.appendChild(printDiv);
  }
  printDiv.innerHTML = html;
  window.print();
}

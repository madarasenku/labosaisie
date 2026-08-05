/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — export-pdf.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

async function exportPDF(id) {
  try {
    const record = getDB().find(x => x.id === id);
    if (!record) { toast('Fiche introuvable', 'err'); return; }
    await ensureFull(record); // ✅ v13.5 — détail complet avant export PDF

    if (isDossierRecord(record)) {
      // ✅ v13.10 — Dossier unifié : PDF multi-pages (une page par analyse)
      const types = getRecordTypes(record);
      if (!types.length) { toast('Dossier vide', 'err'); return; }
      const analyses = types.map(t => ({ type: t, res: getRecordResultats(record, t) }));
      buildPDF(record, analyses);
    } else {
      buildPDF(record);
    }
  } catch(err) {
    console.error('exportPDF:', err);
    toast('Erreur PDF : ' + (err.message||err), 'err');
  }
}

// Export Excel d'une fiche depuis l'historique (par id) — c'était la fonction
// manquante qui empêchait le bouton ⬇ Excel de la table Historique de fonctionner.
async function exportRecord(id) {
  const record = getDB().find(x => x.id === id);
  if (!record) { toast('Fiche introuvable', 'err'); return; }
  if (!ensureExcelJSReady()) return;

  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Dossier ' + (record.patient?.dossier || '');

  const usedNamesR = new Set();
  try {
    if (isDossierRecord(record)) {
      const types = getRecordTypes(record);
      if (!types.length) { toast('Aucune analyse dans ce dossier', 'err'); return; }
      types.forEach(type => {
        const fakeRecord = { ...record, type, resultats: getRecordResultats(record, type) };
        buildProfessionalSheet(wb, fakeRecord, safeSheetName(type, usedNamesR));
      });
    } else {
      buildProfessionalSheet(wb, record, safeSheetName(getDisplayTypeShort(record), usedNamesR));
    }
  } catch(err) {
    console.error('buildProfessionalSheet:', err);
    toast('Erreur lors de la construction du fichier Excel : ' + (err.message || err), 'err');
    return;
  }

  // ✅ v13.34 — Onglet récapitulatif en première position
  try {
    const recap = wb.addWorksheet('Récapitulatif', { properties: { tabColor: { argb: 'FF1E3A8A' } } });
    const p = record.patient || {};
    recap.columns = [{width:28},{width:40}];
    const addR = (label, val, bold) => {
      const r = recap.addRow([label, val || '—']);
      r.getCell(1).font = { bold:true, color:{argb:'FF1E3A8A'}, size:10 };
      r.getCell(2).font = { bold:!!bold, size:10 };
      r.getCell(1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F0FE'}};
      r.getCell(2).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFF'}};
      r.getCell(1).border = r.getCell(2).border = {bottom:{style:'thin',color:{argb:'FFD0DCF7'}}};
    };
    // Titre
    recap.mergeCells('A1:B1');
    const t = recap.getCell('A1');
    t.value = 'CPMI DE GRAND-BASSAM — Résumé du dossier';
    t.font = {bold:true, size:13, color:{argb:'FFFFFFFF'}};
    t.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A8A'}};
    t.alignment = {horizontal:'center',vertical:'middle'};
    recap.getRow(1).height = 28;
    recap.addRow([]);
    addR('N° Dossier', p.dossier, true);
    addR('Patient', p.nom);
    addR('Date', p.date ? p.date.split('-').reverse().join('/') : '');
    addR('Âge / Sexe', [p.age ? p.age + ' ans' : '', p.sexe].filter(Boolean).join(' · '));
    addR('Service', p.service);
    addR('Médecin', p.medecin);
    addR('Analyses', getRecordTypes(record).join(', '));
    addR('Montant total', record.montant ? record.montant.toLocaleString('fr-FR') + ' FCFA' : '—', true);
    addR('Saisi par', record.createdBy);
    addR('Date enregistrement', record.savedAt ? new Date(record.savedAt).toLocaleString('fr-FR') : '');
    // Déplacer la feuille récap en premier
    wb.moveWorksheet('Récapitulatif', 0);
  } catch(e) { console.warn('recap sheet:', e); }

  await addQrAndSignatures(wb); // ✅ v13.37 — QR + signature
  await downloadWorkbook(wb, makeFilename(
    record.patient?.dossier, record.patient?.date,
    record.patient?.nom || 'PATIENT', 'Dossier'
  ));
  toast('Export Excel réussi ✓', 'ok');
}

// Export Excel multi-feuilles de TOUTES les fiches d'un même patient
// (même N° de dossier) — appelé depuis le bouton 📁 de l'historique,
// qui n'apparaît que lorsque ce dossier a plusieurs fiches enregistrées.
async function exportPatientComplet(dossier) {
  if (!ensureExcelJSReady()) return;
  await refreshDB();
  const db = getDB();
  const recs = db.filter(r => r.patient.dossier === dossier)
                 .sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));
  if (!recs.length) { toast('Aucune fiche trouvée pour ce dossier', 'err'); return; }

  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Dossier complet ' + dossier;

  const usedNames = new Set();
  recs.forEach(r => {
    let base = getDisplayTypeShort(r).substring(0, 28) || 'Fiche';
    let sheetName = base;
    let n = 2;
    while (usedNames.has(sheetName)) { sheetName = (base + ' (' + n + ')').substring(0, 31); n++; }
    usedNames.add(sheetName);
    buildProfessionalSheet(wb, r, sheetName);
  });

  const nom = recs[0].patient.nom || 'PATIENT';
  await addQrAndSignatures(wb); // ✅ v13.37 — QR + signature
  await downloadWorkbook(wb, makeFilename(dossier, recs[0].patient.date, nom, 'Dossier-complet'));
  toast('Dossier complet exporté ✓ (' + recs.length + ' fiches)', 'ok');
}

async function exportPDFFromForm(type) {
  try {
  const p = getPatient();
  if (!validatePatient(p)) return;
  showLoading('Génération du PDF…'); // ✅ v13
  await refreshDB();
  // Chercher dans les dossiers unifiés ET les anciens formats
  let dossier = getDB().find(r => isDossierRecord(r) && r.patient?.dossier === p.dossier);
  if (dossier) {
    await ensureFull(dossier); // ✅ v13.5 — détail complet avant export PDF
    if (!confirmerSiExamensManquants(type, getRecordResultats(dossier, type))) return;
    // ✅ v13.10 — exporter TOUTES les analyses du dossier (une page chacune)
    const types = getRecordTypes(dossier);
    const analyses = types.map(t => ({ type: t, res: getRecordResultats(dossier, t) }));
    buildPDF(dossier, analyses);
  } else {
    let saved = getDB().find(r => r.type === type && r.patient?.dossier === p.dossier);
    if (saved) await ensureFull(saved);
    if (!saved) { toast('Enregistrez la fiche avant d\'exporter en PDF', 'err'); return; }
    if (!confirmerSiExamensManquants(type, saved.resultats)) return;
    buildPDF(saved);
  }
  } catch(err) { console.error('exportPDFFromForm:', err); toast('Erreur PDF : ' + (err.message||err), 'err'); }
}

async function buildPDF(r, analyses) {
  try {
  // Ordre des paramètres NFS pour le PDF (même ordre que l'écran)
  const HEMA_PARAMS_PRINT = HEMA_PARAMS.map(p => p.name);
  const HEMA_FL_PRINT     = HEMA_FL.map(p => p.name);

  // Protection contre CDN non chargé
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast('Bibliothèque PDF non disponible — vérifiez votre connexion internet', 'err');
    return;
  }
  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ✅ v12.3 — La police intégrée de jsPDF (Helvetica/WinAnsi) ne rend PAS
  // les emojis, superscripts (10⁶), ≥ ≤, flèches, etc. → caractères parasites.
  // On nettoie tout texte AVANT le rendu (titres, cellules, valeurs, unités).
  function pdfSafe(s) {
    if (s == null) return '';
    return String(s)
      .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≈/g, '~')
      .replace(/→/g, '->').replace(/←/g, '<-').replace(/↔/g, '<->')
      .replace(/[↑▲⬆↗]/g, '(+)').replace(/[↓▼⬇↘]/g, '(-)')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, m => '^' + '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(m))
      .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, m => '₀₁₂₃₄₅₆₇₈₉'.indexOf(m))
      .replace(/⁺/g, '+').replace(/⁻/g, '-').replace(/−/g, '-')
      .replace(/β/g, 'beta')
      // emojis, pictogrammes, symboles divers, sélecteurs de variante
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2500}-\u{25FF}\u{FE00}-\u{FE0F}\u{200D}\u{2705}\u{2713}\u{2717}\u{2716}\u{2714}]/gu, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
  // Interception globale : tout passe par pdfSafe sans toucher aux appels existants
  const _rawText = doc.text.bind(doc);
  doc.text = function(txt, x, yy, opts) {
    if (Array.isArray(txt)) txt = txt.map(pdfSafe);
    else txt = pdfSafe(txt);
    return _rawText(txt, x, yy, opts);
  };
  const _rawAutoTable = doc.autoTable.bind(doc);
  doc.autoTable = function(o) {
    if (o) {
      if (Array.isArray(o.head)) o.head = o.head.map(rw => rw.map(pdfSafe));
      if (Array.isArray(o.body)) o.body = o.body.map(rw => rw.map(c => Array.isArray(c) ? c : pdfSafe(c)));
    }
    return _rawAutoTable(o);
  };

  const p = r.patient;
  const W = 210; const MARGIN = 10; // ✅ v13.34 — marges réduites
  const profile = profileFromPatient(p); // ✅ v13.17 — valeurs normales
  const _paramByName = {};
  [...(typeof HEMA_PARAMS!=='undefined'?HEMA_PARAMS:[]), ...(typeof HEMA_FL!=='undefined'?HEMA_FL:[])].forEach(pp => { _paramByName[pp.name] = pp; });

  // ✅ v13.10 — Un dossier multi-analyses génère une PAGE par analyse.
  const _analyses = (Array.isArray(analyses) && analyses.length)
    ? analyses : [{ type: r.type, res: r.resultats || {} }];

  for (let __i = 0; __i < _analyses.length; __i++) {
    const __a = _analyses[__i];
  const rType = __a.type;
  const res = __a.res || {};
  if (__i > 0) doc.addPage();
  let y = MARGIN;

  // ── En-tête bleu ─────────────────────────────────────────
  doc.setFillColor(30, 58, 138); // C_HEADER_BG
  doc.rect(0, 0, W, 26, 'F');

  // Liséré doré
  doc.setFillColor(203, 161, 53);
  doc.rect(0, 0, W, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('CPMI DE GRAND BASSAM', MARGIN + 18, 10);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text("Laboratoire d'analyses medicales - Grand-Bassam", MARGIN + 18, 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RESULTAT : ' + getDisplayType({ type: rType, resultats: res }).toUpperCase(), MARGIN + 18, 22);

  // Liseré bleu clair bas
  doc.setFillColor(96, 165, 250);
  doc.rect(0, 26, W, 1.5, 'F'); // ✅ v13.34

  // ── Logo CPMI — silhouette mère-enfant + croix dorée (dessin vectoriel natif) ──
  const lcx = MARGIN + 9, lcy = 13; // centre du cercle logo (✅ v13.34)
  doc.setFillColor(255, 255, 255);
  doc.circle(lcx, lcy, 8.2, 'F');

  doc.setFillColor(30, 58, 138); // silhouette en bleu profond CPMI
  // Tête (cercle)
  doc.circle(lcx, lcy - 4.3, 1.55, 'F');
  // Corps (triangle arrondi approximé par un polygone lissé)
  doc.setDrawColor(30, 58, 138);
  doc.setFillColor(30, 58, 138);
  doc.triangle(lcx - 3.4, lcy + 4.6, lcx + 3.4, lcy + 4.6, lcx, lcy - 2.0, 'F');
  // Petit arrondi de base pour adoucir le triangle
  doc.circle(lcx, lcy + 4.2, 0.9, 'F');

  // Croix médicale dorée, petite, en bas à droite du cercle (signature CPMI)
  doc.setFillColor(251, 191, 36);
  doc.roundedRect(lcx + 4.6, lcy + 2.0, 1.3, 4.0, 0.4, 0.4, 'F');
  doc.roundedRect(lcx + 3.1, lcy + 3.5, 4.0, 1.3, 0.4, 0.4, 'F');

  y = 30; // ✅ v13.34

  // ── Fiche patient ─────────────────────────────────────────
  doc.setFillColor(220, 232, 251);
  doc.rect(MARGIN, y, W - 2*MARGIN, 7, 'F');
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('IDENTIFICATION DU PATIENT', MARGIN + 2, y + 5);
  y += 9;

  doc.setFillColor(241, 245, 254);
  doc.rect(MARGIN, y, W - 2*MARGIN, 22, 'F');
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  const col1 = MARGIN + 2, col2 = MARGIN + 32, col3 = MARGIN + 95, col4 = MARGIN + 118;
  doc.text('N° Dossier', col1, y + 5); doc.setFont('helvetica','normal'); doc.text(p.dossier || '—', col2, y + 5);
  doc.setFont('helvetica','bold');
  doc.text('Date', col3, y + 5); doc.setFont('helvetica','normal'); doc.text((p.date || '—').split('-').reverse().join('/'), col4, y + 5);

  doc.setFont('helvetica','bold');
  doc.text('Patient', col1, y + 11); doc.setFont('helvetica','normal'); doc.text(p.nom || '—', col2, y + 11);
  doc.setFont('helvetica','bold');
  doc.text('Âge / Sexe', col3, y + 11); doc.setFont('helvetica','normal');
  doc.text((p.age ? p.age + ' ans' : '') + (p.sexe ? ' — ' + p.sexe : ''), col4, y + 11);

  doc.setFont('helvetica','bold');
  doc.text('Médecin', col1, y + 17); doc.setFont('helvetica','normal'); doc.text(p.medecin || '—', col2, y + 17);
  doc.setFont('helvetica','bold');
  doc.text('Service', col3, y + 17); doc.setFont('helvetica','normal'); doc.text(p.service || '—', col4, y + 17);

  y += 26;

  // ── Tableau des résultats ─────────────────────────────────
  const rows = [];

  if (rType === 'Hématologie') {

    const addTable = (head, body, opts={}) => {
      if (!body.length) return;
      const o2 = { ...opts }; delete o2.interpCol;
      doc.autoTable({
        startY: y, head: [head], body,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */ },
        headStyles: { fillColor: [30,58,138], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [250,251,253] },
        ...o2,
        // ✅ v13.18 — colorer la cellule Valeur (col 1) selon l'interprétation
        // stockée en dernière colonne (même logique qu'Excel, sans afficher l'interp)
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index !== 1) return;
          const rowData = data.row.raw;
          const interp = String(rowData[rowData.length - 1] || '').toLowerCase();
          if (interp.includes('élevé')||interp.includes('eleve'))       { data.cell.styles.textColor=[153,27,27];  data.cell.styles.fillColor=[253,232,232]; }
          else if (interp.includes('bas'))                               { data.cell.styles.textColor=[30,64,175];  data.cell.styles.fillColor=[232,240,254]; }
          else if (interp.includes('normal'))                            { data.cell.styles.textColor=[21,128,61];  data.cell.styles.fillColor=[232,248,238]; }
        }
      });
      y = doc.lastAutoTable.finalY + 3; // ✅ v13.34
    };

    const sectionTitle = (txt) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,58,138);
      doc.text(txt, MARGIN, y); y += 3.5; // ✅ v13.34
    };

    // ── NFS ─────────────────────────────────────────────────────
    const nfsRows = [];
    [...HEMA_PARAMS_PRINT, ...HEMA_FL_PRINT].forEach(name => {
      const v = res[name];
      if (!v || typeof v !== 'object') return;
      if (!v.valeur) return;
      nfsRows.push([name, v.valeur, v.unite || '/µL', refDisplayFor(_paramByName[name], profile) || '—', v.interp || '']); // ✅ v13.25
    });
    if (nfsRows.length) {
      sectionTitle('🩸 NFS — Numération Formule Sanguine');
      // 4 colonnes affichées, 5e colonne = interp pour la colorisation (masquée via columnStyles)
      addTable(['Paramètre','Valeur','Unité','Valeurs normales'], nfsRows,
        { columnStyles: { 4: { cellWidth: 0.1, minCellWidth: 0, overflow: 'hidden' } } });
    }

    // ── Électrophorèse Hb ────────────────────────────────────────
    const ephbRows = [];
    ['Hb A','Hb A2','Hb F','Hb S','Hb C','Hb D','Hb E'].forEach(name => {
      const v = res[name];
      if (v && typeof v === 'object' && v.valeur) ephbRows.push([name, v.valeur, '%', v.interp||'']);
    });
    if (ephbRows.length || res['Profil Hb']) {
      sectionTitle('🔬 Électrophorèse de l\'Hémoglobine');
      if (ephbRows.length) addTable(['Fraction','%','Unité','Commentaire'], ephbRows);
      if (res['Profil Hb']) {
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(50,50,50);
        doc.text('Profil : ' + res['Profil Hb'], MARGIN, y); y += 4;
      }
      if (res['Commentaire Hb']) {
        doc.setFont('helvetica','italic'); doc.setFontSize(8);
        doc.text(res['Commentaire Hb'], MARGIN, y, {maxWidth: W-2*MARGIN}); y += 6;
      }
    }

    // ── GE / Parasitologie ───────────────────────────────────────
    const geRes    = res['GE - Résultat'] || '';
    const geEspece = res['GE - Espèce'] || '';
    const gePara   = res['GE - Parasitémie (%)'] || '';
    const geDensite= res['GE - Densité parasitaire (/µL)'] || '';
    const geStade  = res['GE - Stade'] || '';
    const geTDR    = res['GE - TDR'] || '';
    const geObs    = res['GE - Observation'] || '';
    if (geRes || geEspece || gePara || geTDR) {
      sectionTitle('🦟 Goutte Épaisse / Parasitologie');
      const geRows = [];
      if (geRes)    geRows.push(['Résultat GE', geRes, '', '']);
      if (geTDR)    geRows.push(['TDR Paludisme', geTDR, '', '']);
      if (geEspece) geRows.push(['Espèce plasmodiale', geEspece, '', '']);
      if (gePara)   geRows.push(['Parasitémie', gePara, '%', '']);
      if (geDensite) geRows.push(['Densité parasitaire', geDensite, '/µL', '']);
      if (geStade)  geRows.push(['Stade parasitaire', geStade, '', '']);
      if (geObs)    geRows.push(['Observation', geObs, '', '']);
      addTable(['Paramètre','Résultat','Unité','Observation'], geRows);
    }

    // ── Groupe sanguin ───────────────────────────────────────────
    const gsAbo = res['Groupe ABO'] || res['GS - ABO'] || '';
    const gsRh  = res['Rhésus']     || res['GS - Rhésus'] || '';
    const gsObs = res['Commentaire GS'] || '';
    if (gsAbo || gsRh) {
      sectionTitle('🩸 Groupe Sanguin ABO / Rhésus');
      const gsRows = [];
      if (gsAbo) gsRows.push(['Groupe ABO', gsAbo, '', '']);
      if (gsRh)  gsRows.push(['Rhésus',     gsRh,  '', '']);
      addTable(['Paramètre','Résultat','',''], gsRows);
      if (gsObs) {
        doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(80,80,80);
        doc.text(pdfSafe(gsObs), MARGIN, y); y += 5; doc.setTextColor(0);
      }
    }

    // ── CRP ──────────────────────────────────────────────────────
    const crpVal    = res['CRP - Valeur'] || '';
    if (crpVal) {
      sectionTitle('🔥 CRP — Protéine C-réactive');
      const crpLabel = crpVal === 'neg' ? 'Négatif (< 6 mg/L)' : crpVal + ' mg/L';
      const crpColor = crpVal === 'neg' ? [21,128,61] : [185,28,28];
      doc.autoTable({
        startY: y,
        head: [['Test','Résultat','Valeurs normales']],
        body: [['CRP Latex', crpLabel, '< 6 mg/L']],
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */ },
        headStyles: { fillColor: [30,58,138], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1:{ textColor: crpColor, fontStyle:'bold' } },
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Widal & Félix ────────────────────────────────────────────
    const _wid = widalReport(res);
    const widalRows = _wid.rows.map(w => [w.name, w.titre, w.cinetique || '—', w.interp || '—']);
    const widalConclusion = _wid.concl;
    if (_wid.show) {
      sectionTitle('🦠 Sérodiagnostic de Widal & Félix');
      if (widalRows.length) {
        addTable(['Antigène','Titre','Cinétique','Commentaire'], widalRows);
      }
      if (widalConclusion) {
        const isEtat  = widalConclusion.includes('ÉTAT');
        const isDebut = widalConclusion.includes('DÉBUT');
        const isCicat = widalConclusion.includes('CICATRI');
        const bgColor  = isEtat  ? [253,232,232] : isDebut ? [254,243,199] : isCicat ? [254,252,232] : [245,247,250];
        const txtColor = isEtat  ? [185,28,28]   : isDebut ? [180,83,9]   : isCicat  ? [133,77,14]  : [55,65,81];
        doc.setFillColor(...bgColor);
        doc.roundedRect(MARGIN, y, W-2*MARGIN, 10, 2, 2, 'F');
        doc.setTextColor(...txtColor); doc.setFont('helvetica','bold'); doc.setFontSize(8);
        doc.text(widalConclusion.replace(/^[🔴🟠🟡⚪]\s*/,''), MARGIN+3, y+6.5, {maxWidth: W-2*MARGIN-6});
        y += 14;
      }
    }

  } else {
    // ✅ v13.37 — CRP / Widal / Groupe sanguin explicites (dossier Immuno seul) :
    // le rendu générique n'affichait pas les antigènes Widal (objets .titre).
    const _crpV = res['CRP - Valeur'];
    if (_crpV) {
      sectionTitle('🔥 CRP — Protéine C-réactive');
      const _lbl = _crpV === 'neg' ? 'Négatif (< 6 mg/L)' : _crpV + ' mg/L';
      addTable(['Test','Résultat','Valeurs normales'], [['CRP Latex', _lbl, '< 6 mg/L']]);
    }
    const _wid2 = (typeof widalReport === 'function') ? widalReport(res) : { show:false, rows:[], concl:'' };
    if (_wid2.show) {
      sectionTitle('🦠 Sérodiagnostic de Widal & Félix');
      const _wr = _wid2.rows.map(w => [w.name, w.titre, w.cinetique||'—', w.interp||'—']);
      if (_wr.length) addTable(['Antigène','Titre','Cinétique','Commentaire'], _wr);
      if (_wid2.concl) { doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(80,80,80); doc.text(_wid2.concl.replace(/^[🔴🟠🟡⚪]\s*/,''), MARGIN, y, {maxWidth:W-2*MARGIN}); y += 6; }
    }
    const _gA = res['Groupe ABO'] || res['GS - ABO'];
    const _gR = res['Rhésus'] || res['GS - Rhésus'];
    if (_gA || _gR) {
      sectionTitle('🩸 Groupe Sanguin ABO / Rhésus');
      const _gr = []; if (_gA) _gr.push(['Groupe ABO', _gA, '']); if (_gR) _gr.push(['Rhésus', _gR, '']);
      addTable(['Paramètre','Résultat',''], _gr);
    }
    // Pour les autres types : affichage générique clé/valeur
    // ✅ v13.17 — index nom→paramètre pour les valeurs normales
    const _pbn = {};
    [...(typeof BIO_GLUCIDES!=='undefined'?[...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE]:[]),
     ...(typeof HEMA_PARAMS!=='undefined'?[...HEMA_PARAMS,...HEMA_FL]:[]),
     ...(typeof BPN_NFS!=='undefined'?[...BPN_NFS]:[]),
     ...(typeof BPN_FL!=='undefined'?[...BPN_FL]:[]),
     ...(typeof SERO_TESTS!=='undefined'?SERO_TESTS:[]),
    ].forEach(pp => { if (pp && pp.name) _pbn[pp.name] = pp; });
    Object.entries(res).forEach(([k, v]) => {
      if (k.startsWith('_')) return; // ✅ v12 — ignorer clés techniques
      // ✅ v13.37 — CRP/Widal/GS déjà rendus explicitement ci-dessus
      if (k.startsWith('Widal - ') || k.startsWith('CRP - ') || k.startsWith('GS - ')
          || k === 'Groupe ABO' || k === 'Rhésus' || k === 'Commentaire GS') return;
      if (typeof v === 'object' && v !== null) {
        const val = v.valeur || v.resultat || '';
        if (val) rows.push([k, val, v.unite || '', refDisplayFor(_pbn[k], profile) || '', v.interp || v.obs || '']);
      } else if (v && typeof v === 'string' && v !== '—') {
        rows.push([k, v, '', '', '']);
      }
    });
    if (rows.length) {
      doc.autoTable({
        startY: y,
        head: [['Paramètre', 'Résultat', 'Unité', 'Valeurs normales']],
        body: rows.map(r => r.slice(0,4)),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */ },
        headStyles: { fillColor: [30,58,138], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [250,251,253] },
      });
      y = doc.lastAutoTable.finalY + 6;
    }
  }

  // ✅ v12.4 — Composition BPN + examens demandés non renseignés
  const pdfSectionTitle = (txt) => {
    if (y > 250) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,58,138);
    doc.text(txt, MARGIN, y); y += 5;
  };
  if (Array.isArray(res['_bpn_inclus']) && res['_bpn_inclus'].length) {
    pdfSectionTitle('Composition du bilan prénatal (forfait ' + (r.montant||20000).toLocaleString('fr-FR') + ' FCFA)');
    doc.autoTable({
      startY: y,
      body: res['_bpn_inclus'].map(l => ['☑', l]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0:{ cellWidth: 8, halign:'center', textColor:[21,128,61] } },
      alternateRowStyles: { fillColor: [240,253,250] },
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  const pdfPending = getPendingCheckedExams({ ...r, type: rType, resultats: res }, rType);
  if (pdfPending.length) {
    pdfSectionTitle('Examens demandés — résultats à compléter');
    pdfPending.forEach(ex => {
      doc.autoTable({
        startY: y,
        head: [[ex.label, 'Résultat', 'Unité', 'Valeurs normales']],
        body: ex.rows.map(pr => [pr.name, '', pr.unit, pr.ref]),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */, minCellHeight: 7 },
        headStyles: { fillColor: [71,85,105], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1:{ fillColor:[255,255,255] } },
      });
      y = doc.lastAutoTable.finalY + 4;
    });
    y += 2;
  }

  // ── Pied de page ─────────────────────────────────────────
  // Liseré doré
  doc.setFillColor(203, 161, 53);
  doc.rect(MARGIN, y, W - 2*MARGIN, 0.8, 'F');
  y += 4;

  const now = new Date();
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  // ✅ v13.35 — Ligne méta avec UUID
  const _refDoc = getOrCreateRef(r);
  const _techName = (typeof _currentUser !== 'undefined' && _currentUser?.username) ? _currentUser.username.toUpperCase() : '—';
  doc.text('Édité le ' + now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) + '  ·  CPMI DE GRAND-BASSAM  ·  Réf. ' + _refDoc, MARGIN, y);
  y += 6;

  // ✅ v13.34 — Zone commentaire + signature technicien (médecin supprimé)
  const zoneW = (W - 2*MARGIN);
  const commentW = zoneW * 0.6;
  const sigW = zoneW * 0.38;
  const sigX = MARGIN + commentW + zoneW * 0.02;

  // Zone commentaire technicien
  doc.setFillColor(220, 232, 251);
  doc.rect(MARGIN, y, commentW, 5, 'F');
  doc.setTextColor(30,58,138); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('Commentaire du technicien', MARGIN + 2, y + 3.5);
  doc.setDrawColor(30,58,138); doc.setLineWidth(0.4);
  doc.rect(MARGIN, y + 5, commentW, 16);
  // Lignes de saisie
  doc.setDrawColor(200,210,230); doc.setLineWidth(0.2);
  for (let li = 1; li <= 3; li++) doc.line(MARGIN+2, y+5+li*4, MARGIN+commentW-2, y+5+li*4);

  // ✅ v13.35 — Zone signature PDF avec cursive SVG
  doc.setFillColor(220, 232, 251);
  doc.rect(sigX, y, sigW, 5, 'F');
  doc.setTextColor(30,58,138); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('Signature du technicien', sigX + 2, y + 3.5);
  doc.setDrawColor(30,58,138); doc.setLineWidth(0.4);
  doc.rect(sigX, y + 5, sigW, 22);
  // Signature SVG → PNG via canvas → addImage
  try {
    const _svgStr = generateSignatureSVG(_techName, 140, 40);
    if (_svgStr) {
      const _blob = new Blob([_svgStr], {type:'image/svg+xml'});
      const _url  = URL.createObjectURL(_blob);
      await new Promise(res => {
        const _img = new Image();
        _img.onload = () => {
          const _cv = document.createElement('canvas');
          _cv.width = 280; _cv.height = 80;
          const _ctx = _cv.getContext('2d');
          _ctx.drawImage(_img, 0, 0, 280, 80);
          URL.revokeObjectURL(_url);
          try { doc.addImage(_cv.toDataURL('image/png'), 'PNG', sigX + 1, y + 6, sigW - 2, 14); } catch(e){}
          res();
        };
        _img.onerror = res;
        _img.src = _url;
      });
    }
  } catch(_se) {}
  // Nom et titre sous la signature
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(30,58,138);
  doc.text(_techName, sigX + 2, y + 22);
  doc.setFont('helvetica','italic'); doc.setFontSize(6.5); doc.setTextColor(120);
  doc.text('Technicien de laboratoire · CPMI Grand-Bassam', sigX + 2, y + 25.5);

  // ✅ v13.35 — Double QR dans le PDF
  try {
    const _shareToken = r?.patient?.share_token;
    const _qrContent1 = _shareToken
      ? (APP_PUBLIC_URL + '?share=' + _shareToken)
      : ('CPMI GRAND-BASSAM | REF: ' + _refDoc + ' | DOSSIER: ' + (p?.dossier||'—') + ' | PATIENT: ' + (p?.nom||'').toUpperCase());
    const _qrContent2 = 'CPMI GRAND-BASSAM\nREF: ' + _refDoc + '\nDOSSIER: ' + (p?.dossier||'—') + '\nPATIENT: ' + (p?.nom||'').toUpperCase() + '\nANALYSE: ' + getDisplayType(r) + '\nDATE: ' + (p?.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—');

    const [_qrUrl1, _qrUrl2] = await Promise.all([
      generateQRDataURL(_qrContent1, 80),
      generateQRDataURL(_qrContent2, 80),
    ]);

    const qrSize = 18; // mm dans le PDF
    const qrY = y + 1;
    const qrX1 = W - MARGIN - qrSize * 2 - 4;
    const qrX2 = W - MARGIN - qrSize;

    if (_qrUrl1) {
      doc.addImage(_qrUrl1, 'PNG', qrX1, qrY, qrSize, qrSize);
      doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(30,58,138);
      doc.text(_shareToken ? 'Vérifier en ligne' : 'Info dossier', qrX1 + qrSize/2, qrY + qrSize + 2.5, { align: 'center' });
    }
    if (_qrUrl2) {
      doc.addImage(_qrUrl2, 'PNG', qrX2 + 2, qrY, qrSize, qrSize);
      doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(100,116,139);
      doc.text('Infos patient', qrX2 + 2 + qrSize/2, qrY + qrSize + 2.5, { align: 'center' });
    }
    // Réf sous les QR
    doc.setFont('helvetica','bold'); doc.setFontSize(5.5); doc.setTextColor(30,58,138);
    doc.text('Réf. ' + _refDoc, qrX1 + qrSize + 2, qrY + qrSize + 6, { align: 'center' });
  } catch(_qrErr) { /* QR optionnel — ne bloque pas le PDF */ }

  // ✅ v13.35 — Pied de page conformité
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6); doc.setTextColor(120);
  const _conformite = 'Document officiel CPMI Grand-Bassam · Réf. ' + _refDoc + ' · Résultats à interpréter par un professionnel de santé · Usage médical exclusif';
  doc.text(_conformite, W/2, 286, { align: 'center', maxWidth: W - 2*MARGIN });

  // Numéro de page
  doc.setTextColor(150); doc.setFont('helvetica','normal'); doc.setFontSize(7);
  doc.text('Page ' + (__i+1) + '/' + _analyses.length, W - MARGIN, 290, { align: 'right' });

  } // ✅ v13.10 — fin de la boucle par analyse (for...of pour await)

  // Téléchargement — même convention de nommage que l'export Excel
  const filename = makeFilename(p.dossier, p.date, p.nom, getDisplayTypeShort(r)).replace(/\.xlsx$/, '.pdf');
  doc.save(filename);
  toast('PDF généré ✓', 'ok');
  } catch(err) {
    console.error('buildPDF:', err);
    toast('Erreur génération PDF : ' + (err.message||err), 'err');
  } finally {
    hideLoading(); // ✅ v13
  }
}

// ============================================================
// CONFIGURATION DES TARIFS
// ============================================================

// ──────────────────────────────────────────────────────────────
// TARIFICATION — Architecture claire :
//
//  localStorage 'tarifs_ref'  = prix de RÉFÉRENCE (gérés par admin dans Comptes)
//  localStorage 'examens_custom' = examens ajoutés par l'admin
//  px_{id} sur la fiche       = prix SESSION (modifiable par agent, réinitialisé
//                               au Nouveau patient via rechargeFichePrix())
//
// Règle : modifier la fiche → ne touche PAS aux tarifs de référence
//         modifier Comptes  → modifie les tarifs de référence ET recharge la fiche
// ──────────────────────────────────────────────────────────────


function exportRistournesPDF() {
  if (!window.jspdf?.jsPDF) { toast('Bibliothèque PDF non disponible', 'err'); return; }
  const mois = parseInt(document.getElementById('rist-mois')?.value || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('rist-annee')?.value || new Date().getFullYear());
  const rows = computeRistournesData(mois, annee);
  const { doc } = _newPDFDoc();
  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('CPMI Grand-Bassam — Ristournes prescripteurs', 14, 16);
  doc.setFontSize(11); doc.setFont(undefined, 'normal');
  doc.text(MOIS_FR[mois - 1] + ' ' + annee, 14, 23);
  doc.autoTable({
    startY: 28,
    head: [['Prescripteur', 'Nb dossiers', 'Montant brut', 'Taux %', 'Ristourne']],
    body: rows.map(r => [r.presc.nom, String(r.nb), _fmtF(r.montantBrut) + ' F', String(r.taux), _fmtF(r.ristourne) + ' F']),
    styles: { fontSize: 9 }, headStyles: { fillColor: [26, 68, 128] },
  });
  const totBrut = rows.reduce((s, r) => s + r.montantBrut, 0);
  const totRist = rows.reduce((s, r) => s + r.ristourne, 0);
  const y = (doc.lastAutoTable?.finalY || 40) + 8;
  doc.setFont(undefined, 'bold');
  doc.text('Total général : ' + _fmtF(totBrut) + ' F brut — ' + _fmtF(totRist) + ' F de ristournes', 14, y);
  doc.save('Ristournes_' + MOIS_FR[mois - 1] + '_' + annee + '.pdf');
}
async function exportRistournesExcel() {
  if (!window.ExcelJS) { toast('Bibliothèque Excel non disponible', 'err'); return; }
  const mois = parseInt(document.getElementById('rist-mois')?.value || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('rist-annee')?.value || new Date().getFullYear());
  const rows = computeRistournesData(mois, annee);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ristournes');
  ws.mergeCells('A1:E1');
  ws.getCell('A1').value = 'CPMI Grand-Bassam — Ristournes prescripteurs — ' + MOIS_FR[mois - 1] + ' ' + annee;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.addRow([]);
  const hdr = ws.addRow(['Prescripteur', 'Nb dossiers', 'Montant brut', 'Taux (%)', 'Ristourne']);
  hdr.font = { bold: true }; hdr.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A4480' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  rows.forEach(r => {
    const row = ws.addRow([r.presc.nom, r.nb, r.montantBrut, r.taux, r.ristourne]);
    row.getCell(3).numFmt = '#,##0" FCFA"'; row.getCell(5).numFmt = '#,##0" FCFA"';
  });
  const tot = ws.addRow(['TOTAL', rows.reduce((s, r) => s + r.nb, 0), rows.reduce((s, r) => s + r.montantBrut, 0), '', rows.reduce((s, r) => s + r.ristourne, 0)]);
  tot.font = { bold: true }; tot.getCell(3).numFmt = '#,##0" FCFA"'; tot.getCell(5).numFmt = '#,##0" FCFA"';
  ws.columns.forEach(c => c.width = 18); ws.getColumn(1).width = 30;
  await downloadWorkbook(wb, 'Ristournes_' + MOIS_FR[mois - 1] + '_' + annee + '.xlsx');
}

// ✅ v13.37 — POINT JOURNALIER DE LA CAISSE (par jour + total)
// Une ligne par jour : date, nombre de patients, total encaissé ; puis un total général.
function _frDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : (d || '—');
}
function _pointJournalierData() {
  const db = getCalcDB();
  const { from, to } = getCaisseRange();
  const rows = filterByDateRange(db, from, to);

  // ── Par jour : nb patients, total, payé, non payé ──
  const parJour = {};
  rows.forEach(r => {
    const d = _recDate(r) || '—';
    const j = (parJour[d] = parJour[d] || { nb: 0, total: 0, paye: 0, nonPaye: 0 });
    const m = r.montant || 0;
    j.nb++; j.total += m;
    if (getPaiementStatus(r.id) === 'paye') j.paye += m; else j.nonPaye += m;
  });
  const jours = Object.keys(parJour).sort();

  // ── Par type d'analyse (même logique que la caisse à l'écran) ──
  const byType = {};
  rows.forEach(r => {
    const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type];
    const montants = r.resultats?._montants || null;
    types.forEach(t => {
      if (!t) return;
      const b = (byType[t] = byType[t] || { nb: 0, total: 0 });
      b.nb++;
      b.total += montants ? (Number(montants[t]) || 0) : (types.length === 1 ? (r.montant || 0) : 0);
    });
  });
  const typeRows = Object.entries(byType).filter(([, v]) => v.nb > 0).sort((a, b) => b[1].total - a[1].total);

  // ── Par prescripteur (tous, pas seulement le top 5) ──
  const byPresc = {};
  rows.forEach(r => {
    const pid = r.prescripteur_id;
    const nom = (_prescripteurs.find(p => Number(p.id) === Number(pid))?.nom) || r.patient?.medecin || 'Inconnu';
    const b = (byPresc[nom] = byPresc[nom] || { nb: 0, total: 0 });
    b.nb++; b.total += (r.montant || 0);
  });
  const prescRows = Object.entries(byPresc).sort((a, b) => b[1].total - a[1].total);

  const totMontant = rows.reduce((s, r) => s + (r.montant || 0), 0);
  const totPaye = rows.filter(r => getPaiementStatus(r.id) === 'paye').reduce((s, r) => s + (r.montant || 0), 0);
  return {
    from, to, jours, parJour, typeRows, prescRows,
    totNb: rows.length, totMontant, totPaye, totNonPaye: totMontant - totPaye
  };
}

async function exportPointJournalierExcel() {
  if (typeof ensureExcelJSReady === 'function' ? !ensureExcelJSReady() : !window.ExcelJS) {
    toast('Bibliothèque Excel non disponible', 'err'); return;
  }
  await refreshDB();
  const D = _pointJournalierData();
  if (!D.jours.length) { toast('Aucune donnée sur la période sélectionnée', 'err'); return; }
  const wb = new ExcelJS.Workbook();
  const MONEY = '#,##0" FCFA"';
  const titre = (ws, txt, span) => {
    ws.mergeCells('A1:' + span + '1'); ws.getCell('A1').value = txt; ws.getCell('A1').font = { bold: true, size: 13 };
    ws.mergeCells('A2:' + span + '2'); ws.getCell('A2').value = 'Période : ' + _frDate(D.from) + '  →  ' + _frDate(D.to);
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    ws.addRow([]);
  };
  const hdr = (ws, cols) => { const h = ws.addRow(cols); h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A4480' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center' }; }); };
  const totalRow = (ws, cells, moneyCols) => { const t = ws.addRow(cells); t.eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEAF7' } }; }); moneyCols.forEach(c => t.getCell(c).numFmt = MONEY); };

  // Feuille 1 : Point journalier
  const ws1 = wb.addWorksheet('Point journalier');
  titre(ws1, 'CPMI Grand-Bassam — Point journalier de la caisse', 'E');
  hdr(ws1, ['Date', 'Nb patients', 'Total (FCFA)', 'Payé (FCFA)', 'Non payé (FCFA)']);
  D.jours.forEach(d => {
    const j = D.parJour[d];
    const row = ws1.addRow([_frDate(d), j.nb, j.total, j.paye, j.nonPaye]);
    row.getCell(2).alignment = { horizontal: 'center' };
    [3, 4, 5].forEach(c => row.getCell(c).numFmt = MONEY);
  });
  totalRow(ws1, ['TOTAL', D.totNb, D.totMontant, D.totPaye, D.totNonPaye], [3, 4, 5]);
  ws1.getColumn(1).width = 16; ws1.getColumn(2).width = 13; [3, 4, 5].forEach(c => ws1.getColumn(c).width = 18);

  // Feuille 2 : Par type d'analyse
  const ws2 = wb.addWorksheet("Par type d'analyse");
  titre(ws2, "CPMI Grand-Bassam — Répartition par type d'analyse", 'C');
  hdr(ws2, ["Type d'analyse", 'Nb dossiers', 'Total (FCFA)']);
  D.typeRows.forEach(([t, v]) => { const row = ws2.addRow([t, v.nb, v.total]); row.getCell(2).alignment = { horizontal: 'center' }; row.getCell(3).numFmt = MONEY; });
  totalRow(ws2, ['TOTAL', D.typeRows.reduce((s, [, v]) => s + v.nb, 0), D.typeRows.reduce((s, [, v]) => s + v.total, 0)], [3]);
  ws2.getColumn(1).width = 28; ws2.getColumn(2).width = 13; ws2.getColumn(3).width = 20;

  // Feuille 3 : Par prescripteur
  const ws3 = wb.addWorksheet('Par prescripteur');
  titre(ws3, 'CPMI Grand-Bassam — Répartition par prescripteur', 'C');
  hdr(ws3, ['Prescripteur', 'Nb dossiers', 'Total (FCFA)']);
  D.prescRows.forEach(([nom, v]) => { const row = ws3.addRow([nom, v.nb, v.total]); row.getCell(2).alignment = { horizontal: 'center' }; row.getCell(3).numFmt = MONEY; });
  totalRow(ws3, ['TOTAL', D.prescRows.reduce((s, [, v]) => s + v.nb, 0), D.prescRows.reduce((s, [, v]) => s + v.total, 0)], [3]);
  ws3.getColumn(1).width = 30; ws3.getColumn(2).width = 13; ws3.getColumn(3).width = 20;

  await downloadWorkbook(wb, 'Point_caisse_' + (D.from || 'debut') + '_' + (D.to || 'fin') + '.xlsx');
  toast('Export Excel réussi ✓', 'ok');
}

function exportPointJournalierPDF() {
  if (!window.jspdf?.jsPDF) { toast('Bibliothèque PDF non disponible', 'err'); return; }
  const D = _pointJournalierData();
  if (!D.jours.length) { toast('Aucune donnée sur la période sélectionnée', 'err'); return; }
  const { doc } = _newPDFDoc();
  const HEAD = [26, 68, 128], FOOT = [220, 234, 247];
  const foot = { fillColor: FOOT, textColor: HEAD, fontStyle: 'bold' };

  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('CPMI Grand-Bassam - Point journalier de la caisse', 14, 16);
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('Periode : ' + _frDate(D.from) + '  ->  ' + _frDate(D.to), 14, 23);

  // 1) Par jour
  doc.autoTable({
    startY: 28,
    head: [['Date', 'Nb pat.', 'Total', 'Paye', 'Non paye']],
    body: D.jours.map(d => { const j = D.parJour[d]; return [_frDate(d), String(j.nb), _fmtF(j.total) + ' F', _fmtF(j.paye) + ' F', _fmtF(j.nonPaye) + ' F']; }),
    foot: [['TOTAL', String(D.totNb), _fmtF(D.totMontant) + ' F', _fmtF(D.totPaye) + ' F', _fmtF(D.totNonPaye) + ' F']],
    styles: { fontSize: 9 }, headStyles: { fillColor: HEAD }, footStyles: foot,
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
  });

  // 2) Par type d'analyse
  let y = (doc.lastAutoTable?.finalY || 40) + 10;
  doc.setFont(undefined, 'bold'); doc.setFontSize(12); doc.text("Repartition par type d'analyse", 14, y);
  doc.autoTable({
    startY: y + 3,
    head: [['Type', 'Nb dossiers', 'Total']],
    body: D.typeRows.map(([t, v]) => [t, String(v.nb), _fmtF(v.total) + ' F']),
    foot: [['TOTAL', String(D.typeRows.reduce((s, [, v]) => s + v.nb, 0)), _fmtF(D.typeRows.reduce((s, [, v]) => s + v.total, 0)) + ' F']],
    styles: { fontSize: 9 }, headStyles: { fillColor: HEAD }, footStyles: foot,
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } }
  });

  // 3) Par prescripteur
  y = (doc.lastAutoTable?.finalY || 40) + 10;
  doc.setFont(undefined, 'bold'); doc.setFontSize(12); doc.text('Repartition par prescripteur', 14, y);
  doc.autoTable({
    startY: y + 3,
    head: [['Prescripteur', 'Nb dossiers', 'Total']],
    body: D.prescRows.map(([nom, v]) => [nom, String(v.nb), _fmtF(v.total) + ' F']),
    foot: [['TOTAL', String(D.prescRows.reduce((s, [, v]) => s + v.nb, 0)), _fmtF(D.prescRows.reduce((s, [, v]) => s + v.total, 0)) + ' F']],
    styles: { fontSize: 9 }, headStyles: { fillColor: HEAD }, footStyles: foot,
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } }
  });

  doc.save('Point_caisse_' + (D.from || 'debut') + '_' + (D.to || 'fin') + '.pdf');
  toast('Export PDF réussi ✓', 'ok');
}

// ── FEATURE 7 : rapport d'activité mensuel (PDF) ──────────────────
function _newPDFDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfSafe = s => s == null ? '' : String(s)
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/µ/g, 'u').replace(/²/g, '2').replace(/³/g, '3')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '').trim();
  const _rawText = doc.text.bind(doc);
  doc.text = function (t, x, y, o) { t = Array.isArray(t) ? t.map(pdfSafe) : pdfSafe(t); return _rawText(t, x, y, o); };
  if (doc.autoTable) {
    const _rawAT = doc.autoTable.bind(doc);
    doc.autoTable = function (o) {
      if (o) { if (Array.isArray(o.head)) o.head = o.head.map(r => r.map(pdfSafe)); if (Array.isArray(o.body)) o.body = o.body.map(r => r.map(pdfSafe)); }
      return _rawAT(o);
    };
  }
  return { doc, jsPDF };
}
async function genererRapportMensuel() {
  if (!window.jspdf?.jsPDF) { toast('Bibliothèque PDF non disponible', 'err'); return; }
  await refreshDB();
  const mois = parseInt(document.getElementById('rapport-mois')?.value || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('rapport-annee')?.value || new Date().getFullYear());
  const prefix = annee + '-' + String(mois).padStart(2, '0');
  const db = getCalcDB().filter(r => _recDate(r).startsWith(prefix)); // ✅ v13.30 — exclut les fiches verrouillées du rapport PDF
  const { doc } = _newPDFDoc();
  const W = 210, M = 14;

  // Page de garde
  doc.setFillColor(26, 68, 128); doc.rect(0, 0, W, 60, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont(undefined, 'bold');
  doc.text('CPMI GRAND-BASSAM', W / 2, 28, { align: 'center' });
  doc.setFontSize(13); doc.setFont(undefined, 'normal');
  doc.text("Rapport d'activité du laboratoire", W / 2, 40, { align: 'center' });
  doc.setTextColor(0, 0, 0); doc.setFontSize(18); doc.setFont(undefined, 'bold');
  doc.text(MOIS_FR[mois - 1] + ' ' + annee, W / 2, 85, { align: 'center' });
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(120, 120, 120);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), W / 2, 95, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Statistiques globales
  const nbFiches = db.length;
  const totalMontant = db.reduce((s, r) => s + (r.montant || 0), 0);
  const joursDistincts = new Set(db.map(r => _recDate(r)).filter(Boolean)).size || 1;
  let y = 115;
  doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text('1. Statistiques globales', M, y); y += 8;
  doc.setFontSize(11); doc.setFont(undefined, 'normal');
  doc.text('Nombre de dossiers : ' + nbFiches, M, y); y += 6;
  doc.text('Montant total encaissé : ' + _fmtF(totalMontant) + ' FCFA', M, y); y += 6;
  doc.text('Moyenne par jour actif : ' + _fmtF(Math.round(totalMontant / joursDistincts)) + ' FCFA', M, y); y += 6;

  // Répartition par type
  const byType = {}; TYPES_ANALYSES.forEach(t => byType[t] = 0);
  db.forEach(r => { const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type]; types.forEach(t => { if (byType[t] !== undefined) byType[t]++; }); });
  const totType = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('2. Répartition par type d\'analyse', M, y + 4);
  doc.autoTable({ startY: y + 8, head: [['Type', 'Nombre', '%']], body: TYPES_ANALYSES.filter(t => byType[t] > 0).map(t => [t, String(byType[t]), Math.round(byType[t] / totType * 100) + '%']), styles: { fontSize: 9 }, headStyles: { fillColor: [26, 68, 128] } });

  // Répartition par service
  const byService = {};
  db.forEach(r => { const s = r.patient?.service || 'Non précisé'; byService[s] = (byService[s] || 0) + 1; });
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('3. Répartition par service', M, doc.lastAutoTable.finalY + 10);
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 14, head: [['Service', 'Nombre']], body: Object.entries(byService).sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, String(n)]), styles: { fontSize: 9 }, headStyles: { fillColor: [13, 148, 136] } });

  // Top prescripteurs
  const byPresc = {};
  db.forEach(r => { const nom = (_prescripteurs.find(p => Number(p.id) === Number(r.prescripteur_id))?.nom) || r.patient?.medecin || 'Inconnu'; if (!byPresc[nom]) byPresc[nom] = { nb: 0, total: 0 }; byPresc[nom].nb++; byPresc[nom].total += (r.montant || 0); });
  const topP = Object.entries(byPresc).sort((a, b) => b[1].nb - a[1].nb).slice(0, 10);
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('4. Top prescripteurs', M, doc.lastAutoTable.finalY + 10);
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 14, head: [['Prescripteur', 'Nb dossiers', 'Montant']], body: topP.map(([nom, v]) => [nom, String(v.nb), _fmtF(v.total) + ' F']), styles: { fontSize: 9 }, headStyles: { fillColor: [26, 68, 128] } });

  // Courbe d'activité quotidienne (image du canvas)
  doc.addPage();
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('5. Courbe d\'activité quotidienne', M, 20);
  try {
    const parJour = {};
    db.forEach(r => { const d = _recDate(r); if (d) parJour[d] = (parJour[d] || 0) + 1; });
    const jours = Object.keys(parJour).sort();
    if (jours.length && typeof Chart !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = 800; cv.height = 360;
      const ch = new Chart(cv, { type: 'line', data: { labels: jours.map(j => j.slice(8)), datasets: [{ data: jours.map(j => parJour[j]), borderColor: '#0096c7', backgroundColor: 'rgba(0,150,199,.10)', fill: true, tension: .3 }] }, options: { responsive: false, animation: false, plugins: { legend: { display: false } } } });
      await new Promise(res => setTimeout(res, 250));
      doc.addImage(cv.toDataURL('image/png'), 'PNG', M, 26, 180, 80);
      ch.destroy();
    } else { doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text('Données insuffisantes pour tracer la courbe.', M, 30); }
  } catch (e) { doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text('Courbe non disponible.', M, 30); }

  // Alertes critiques
  const critiques = [];
  db.forEach(r => { if (hasCriticalValues(r)) { const al = checkValeursCritiques(r.resultats); (r.resultats?._types || []).forEach(t => al.push(...checkValeursCritiques(r.resultats[t]))); critiques.push({ p: r.patient, al }); } });
  const yc = 120;
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('6. Alertes valeurs critiques du mois', M, yc);
  if (critiques.length) {
    doc.autoTable({ startY: yc + 4, head: [['Patient', 'Dossier', 'Alertes']], body: critiques.slice(0, 40).map(c => [c.p?.nom || '—', c.p?.dossier || '—', c.al.map(a => a.label + '=' + a.valeur + ' ' + a.unite).join('; ') || 'signalé']), styles: { fontSize: 8 }, headStyles: { fillColor: [220, 38, 38] } });
  } else { doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text('Aucune alerte critique enregistrée ce mois.', M, yc + 8); }

  doc.save('Rapport_activite_' + MOIS_FR[mois - 1] + '_' + annee + '.pdf');
  toast('Rapport mensuel généré ✓', 'ok');
}

document.addEventListener('DOMContentLoaded', async () => {
  const isShare = await checkShareMode();
  // Si ce n'est pas un lien de partage, le flux normal (login) prend le relais
});



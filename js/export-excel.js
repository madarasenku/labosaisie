/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — export-excel.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

function dupliquerFiche(id) {
  const r = _dbCache.find(x => x.id === id);
  if (!r) { toast('Fiche introuvable', 'err'); return; }
  showView('saisie');
  const p = r.patient || {};
  const setV = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  setV('p_nom',     p.nom);
  setV('p_age',     p.age);
  setV('p_sexe',    p.sexe);
  setV('p_medecin', p.medecin);
  setV('p_service', p.service);
  setV('p_clinique',p.clinique);
  setV('p_telephone', p.telephone);
  setV('p_date', new Date().toISOString().slice(0, 10));
  regenDossier();
  const examens = r.resultats?._examens_coches || {};
  Object.values(examens).flat().forEach(exId => {
    const chk = document.getElementById(exId);
    if (chk) { chk.checked = true; chk.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  if (typeof rechargeFichePrix === 'function') rechargeFichePrix();
  if (typeof updateAllRefs === 'function') updateAllRefs();
  toast('⧉ Fiche dupliquée — saisissez les nouvelles valeurs', 'ok');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exportBackup() {
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; }
  try {
    const backup = {
      _format: 'cpmi-labo-backup',
      _version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: _currentUser?.username || '',
      count: _dbCache.length,
      fiches: _dbCache
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'cpmi-sauvegarde-' + d + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const st = document.getElementById('backup-status');
    if (st) st.textContent = '✅ ' + _dbCache.length + ' fiche(s) exportée(s)';
    toast('💾 Sauvegarde téléchargée (' + _dbCache.length + ' fiches)', 'ok');
  } catch (e) {
    console.error('exportBackup:', e);
    toast('Erreur lors de la sauvegarde', 'err');
  }
}

// ✅ v13.34 — Restauration : ré-importe les fiches manquantes (ne réécrit rien)
async function importBackup(event) {
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; }
  const file = event.target?.files?.[0];
  if (!file) return;
  const st = document.getElementById('backup-status');
  if (st) st.textContent = '⏳ Lecture du fichier…';

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (e) {
    if (st) st.textContent = '';
    toast('Fichier illisible ou corrompu', 'err');
    event.target.value = '';
    return;
  }
  if (backup._format !== 'cpmi-labo-backup' || !Array.isArray(backup.fiches)) {
    if (st) st.textContent = '';
    toast("Ce fichier n'est pas une sauvegarde CPMI valide", 'err');
    event.target.value = '';
    return;
  }

  // Ne garder que les fiches absentes du cache (par N° de dossier + type)
  const existing = new Set(_dbCache.map(r => (r.patient?.dossier || '') + '|' + (r.type || '')));
  const toImport = backup.fiches.filter(f =>
    !existing.has((f.patient?.dossier || '') + '|' + (f.type || '')));

  if (!toImport.length) {
    if (st) st.textContent = '✅ Rien à restaurer — toutes les fiches sont déjà présentes.';
    toast('Toutes les fiches de la sauvegarde sont déjà présentes', 'ok');
    event.target.value = '';
    return;
  }

  const ok = await showConfirmModal({
    icon: '⬆',
    title: 'Restaurer ' + toImport.length + ' fiche(s) ?',
    message: 'La sauvegarde du ' + (backup.exportedAt || '').slice(0, 10) + ' contient '
      + backup.fiches.length + ' fiche(s), dont ' + toImport.length
      + ' absente(s) de la base actuelle. Les fiches déjà présentes ne seront pas modifiées.',
    confirmText: 'Restaurer', cancelText: 'Annuler'
  });
  if (!ok) { event.target.value = ''; if (st) st.textContent = ''; return; }

  let done = 0, failed = 0;
  for (const f of toImport) {
    try {
      const est_bpn = f.est_bpn || (f.resultats?._types || []).includes('Bilan prénatal');
      const { error } = await _sb.rpc('insert_resultat', {
        p_token: TK(), p_type: f.type, p_patient: f.patient,
        p_resultats: f.resultats, p_montant: f.montant || 0,
        p_prescripteur_id: f.prescripteur_id || null, p_est_bpn: est_bpn
      });
      if (error) throw error;
      done++;
      if (st) st.textContent = '⏳ Restauration… ' + done + '/' + toImport.length;
    } catch (e) {
      console.error('importBackup fiche:', e);
      failed++;
    }
  }

  await refreshDB(true);
  renderHistory(true);
  if (st) st.textContent = '✅ ' + done + ' restaurée(s)' + (failed ? ' · ' + failed + ' échec(s)' : '');
  toast('✅ ' + done + ' fiche(s) restaurée(s)' + (failed ? ' — ' + failed + ' échec(s)' : ''), failed ? 'err' : 'ok');
  event.target.value = '';
}

// ✅ v13.34 — Ouvrir/fermer le menu ⋯ des actions condensées (< 900px)
function toggleActionMenu(btn) {
  const wrap = btn.closest('.action-dropdown') || btn.parentElement;
  const isOpen = wrap.classList.contains('open');
  // Fermer tous les menus ouverts
  document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
  if (!isOpen) {
    wrap.classList.add('open');
    // Fermer au prochain clic ailleurs
    setTimeout(() => {
      document.addEventListener('click', function close(e) {
        if (!wrap.contains(e.target)) { wrap.classList.remove('open'); document.removeEventListener('click', close); }
      });
    }, 0);
  }
}

function clearHistory() {
  console.warn('clearHistory() désactivé en v13.33');
}

// ============================================================
// EXCEL EXPORT — RENDU PROFESSIONNEL (ExcelJS)
// ============================================================

const CENTRE         = 'CPMI DE GRAND-BASSAM';
const CENTRE_SUB     = "Centre de Protection Mère et Infantile";
const CENTRE_ADRESSE = "Laboratoire d'analyses médicales · Grand-Bassam, Côte d'Ivoire";

// Palette sobre — économique en encre
const C_HEADER_BG   = 'FF1E3A8A'; // bleu profond en-tête (seul fond coloré foncé)
const C_HEADER_FG   = 'FFFFFFFF';
const C_SECTION_BG  = 'FFE8F0FE'; // bleu très pâle pour les sections
const C_SECTION_FG  = 'FF1E3A8A';
const C_PAT_BG      = 'FFFAFCFF';
const C_PAT_LABEL_BG= 'FFE8F0FE';
const C_PARAM_BG    = 'FFFFFFFF'; // blanc pur
const C_ALT_BG      = 'FFF5F8FF'; // alternance très légère
const C_BORDER      = 'FFD1D9E6'; // gris clair
const C_HIGH_BG     = 'FFFFF1F1'; // rouge ultra-pâle
const C_HIGH_FG     = 'FFB91C1C';
const C_LOW_BG      = 'FFF0F5FF'; // bleu ultra-pâle
const C_LOW_FG      = 'FF1D4ED8';
const C_NORM_BG     = 'FFF0FDF4'; // vert ultra-pâle
const C_NORM_FG     = 'FF15803D';
const C_LABEL_FG    = 'FF374151';
const C_MUTED       = 'FF6B7280';
const C_TH_BG       = 'FF1E3A8A';
const C_TH_FG       = 'FFFFFFFF';
const C_GOLD        = 'FFCBA135';

function thinBorder(color) {
  const b = { style: 'thin', color: { argb: color || C_BORDER } };
  return { top: b, bottom: b, left: b, right: b };
}

function styleCell(cell, { bg, fg, bold, size, halign, border, italic } = {}) {
  cell.font = { name: 'Calibri', size: size || 10, bold: !!bold, italic: !!italic,
    color: { argb: fg || 'FF111827' } };
  cell.alignment = { horizontal: halign || 'left', vertical: 'middle', wrapText: true };
  if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  if (border) cell.border = thinBorder(border === true ? C_BORDER : border);
}

// Retourne l'intitulé d'examen à afficher : la liste précise des examens
// cochés au départ sur la fiche d'accueil (ex: "NFS · CRP"), ou à défaut
// le type générique de l'onglet (ex: "Hématologie")
// ── Helpers dossier unifié ───────────────────────────────────
// Un enregistrement de type 'Dossier' contient TOUTES les analyses
// d'un même patient en une seule fiche (clé resultats._types).
// ⚠ CONVENTION (v13) — Dans un objet `resultats`, les clés commençant par
// un underscore sont des MÉTADONNÉES techniques, pas des résultats d'analyse :
//   _types           : liste des analyses du dossier
//   _montants        : montant facturé par analyse (recalcul à la suppression)
//   _examens_coches  : examens cochés (demandés) par analyse
//   _bpn_inclus      : composition d'un bilan prénatal (forfait fixe)
// Toute boucle sur `resultats` (rendu, export, impression) DOIT ignorer les
// clés `k.startsWith('_')` pour ne pas les afficher comme des paramètres.
function isDossierRecord(r) { return r && r.type === 'Dossier'; }
function getRecordTypes(r) {
  if (isDossierRecord(r)) return r.resultats?._types || [];
  return r.type ? [r.type] : [];
}

// Retourne les résultats d'une analyse spécifique dans un enregistrement
// (compatible ancien format et nouveau format dossier)
function getRecordResultats(r, type) {
  if (isDossierRecord(r)) {
    const sub = r.resultats?.[type] || {};
    // ✅ v13.6 — réinjecter les examens cochés de CE type (stockés au niveau
    // du dossier) pour qu'ils apparaissent sur la fiche exportée/imprimée.
    const coches = r.resultats?._examens_coches?.[type];
    if (coches && coches.length && !sub._examens_coches) {
      return { ...sub, _examens_coches: coches };
    }
    return sub;
  }
  return r.resultats || {};
}

function getDisplayType(r) {
  if (isDossierRecord(r)) {
    const types = r.resultats?._types || [];
    return types.length ? types.join(' · ') : 'Dossier';
  }
  const coches = r.resultats && r.resultats['_examens_coches'];
  if (coches && coches.length) return coches.join(' · ');
  return r.type || '—';
}

// Version courte pour les noms de fichiers (sigles avant le tiret, sans accents lourds)
function getDisplayTypeShort(r) {
  const coches = r.resultats && r.resultats['_examens_coches'];
  if (coches && coches.length) {
    return coches.map(c => c.split(/[—-]/)[0].trim()).join('+');
  }
  return r.type;
}

function makeFilename(dossier, date, nom, type) {
  const safe = s => (s||'').toString().trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_');
  const d = date ? date.split('-').reverse().join('-') : '';
  return [safe(type), safe(nom)||'PATIENT', safe(dossier), d].filter(Boolean).join('_') + '.xlsx';
}

function buildProfessionalSheet(wb, r, sheetName) {
  // ── Helpers globaux ──────────────────────────────────────────
  const p = r.patient || {};
  const res = r.resultats || {};
  const profile = profileFromPatient(p); // ✅ v13.17 — pour les valeurs normales
  const nomMAJ = (p.nom || 'PATIENT').toUpperCase();
  const dateF  = p.date ? p.date.split('-').reverse().join('/') : '—';
  const ageSexeF = [p.age ? p.age + ' ans' : '', p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : p.sexe || ''].filter(Boolean).join(' · ');

  // Palette
  const BLU  = 'FF1E3A8A'; // bleu profond CPMI
  const BLU2 = 'FF2563EB'; // bleu vif
  const GLD  = 'FFCBA135'; // or
  const WHT  = 'FFFFFFFF';
  const PAT_LABEL = 'FFE8F0FE'; // fond étiquette patient
  const PAT_VAL   = 'FFFAFCFF'; // fond valeur patient
  const SEC_BG    = 'FFDBEAFE'; // fond titre de section
  const SEC_FG    = 'FF1E3A8A';
  const TH_BG     = 'FF1E3A8A';
  const TH_FG     = 'FFFFFFFF';
  const PAR_W     = 'FFFFFFFF'; // ligne paire
  const PAR_A     = 'FFF5F8FF'; // ligne impaire légère
  // ✅ v13.18 — couleurs anormales plus visibles
  const HI_BG     = 'FFFDE8E8'; const HI_FG = 'FF991B1B'; // rouge
  const LO_BG     = 'FFE8F0FE'; const LO_FG = 'FF1E40AF'; // bleu
  const OK_BG     = 'FFE8F8EE'; const OK_FG = 'FF155724'; // vert
  const MUTED     = 'FF6B7280';
  const DARK      = 'FF111827';
  const BRD       = 'FFD1D9E6';

  function tB(col) { const b={style:'thin',color:{argb:col||BRD}}; return {top:b,bottom:b,left:b,right:b}; }
  function medB(col) { const b={style:'medium',color:{argb:col||BLU}}; return {top:b,bottom:b,left:b,right:b}; }

  function sC(cell, {bg,fg,bold,size,ha,border,italic,wt}={}) {
    cell.font = { name:'Calibri', size:size||10, bold:!!bold, italic:!!italic, color:{argb:fg||DARK} };
    cell.alignment = { horizontal:ha||'left', vertical:'middle', wrapText:wt!==false };
    if (bg) cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:bg}};
    if (border) cell.border = tB(border===true ? BRD : border);
  }

  // ✅ v12.2 — Hauteur adaptative : estime le nombre de lignes qu'occupera
  // un texte dans une plage de colonnes (fusion incluse) et retourne la
  // hauteur nécessaire, bornée pour éviter les lignes démesurées.
  const COLW = [37, 20, 12, 12, 20, 14]; // ✅ v13.64 — col. libellé + valeur élargies (lignes sur 1 seule ligne = hauteurs uniformes) · doit rester aligné sur ws.columns
  function spanWidth(c1, c2) { let w = 0; for (let c = c1; c <= c2; c++) w += COLW[c-1] || 10; return w; }
  function neededLines(text, widthChars) {
    const s = String(text ?? '');
    if (!s) return 1;
    return s.split('\n').reduce((n, seg) =>
      n + Math.max(1, Math.ceil(seg.length / Math.max(4, widthChars - 2))), 0);
  }
  // parts : [{text, c1, c2, size?}] — retourne la hauteur max requise
  function fitH(parts, minH) {
    let lines = 1;
    parts.forEach(p => { lines = Math.max(lines, neededLines(p.text, spanWidth(p.c1, p.c2 ?? p.c1))); });
    lines = Math.min(lines, 10); // garde-fou
    return Math.max(minH || 15, lines * 12 + 4);
  }

  // ── Création feuille ─────────────────────────────────────────
  const NC = 6;
  const ws = wb.addWorksheet(sheetName || getDisplayType(r).substring(0,31), {
    // ✅ v13.60 — Largeur toujours ajustée à la page. La hauteur (fitToHeight)
    //   est décidée à la fin selon la longueur : court → 1 page remplie ;
    //   long → taille normale, s'étale sur 2 pages (fixé dans fillPage).
    pageSetup: { paperSize:9, orientation:'portrait', fitToPage:true, fitToWidth:1, fitToHeight:0,
      horizontalCentered:true,
      margins:{left:0.4,right:0.4,top:0.4,bottom:0.4,header:0.15,footer:0.15} },
    views: [{ showGridLines:false, state:'frozen', ySplit:10 }],
  });
  ws.columns = [
    {width:37}, {width:20}, {width:12},
    {width:12}, {width:20}, {width:14},
  ]; // ✅ v13.64 — aligné sur COLW

  let row = 1;
  function mg(r1,c1,r2,c2) { ws.mergeCells(r1,c1,r2,c2); }

  // ════════════════════════════════════════════════════
  // BLOC 1 — EN-TÊTE CPMI
  // ════════════════════════════════════════════════════
  // Liseré or
  ws.getRow(row).height = 5;
  for (let c=1;c<=NC;c++) ws.getCell(row,c).fill={type:'pattern',pattern:'solid',fgColor:{argb:GLD}};
  row++;

  // Nom centre (grande ligne)
  ws.getRow(row).height = 20; // ✅ v13.34 compact
  mg(row,1,row,NC);
  const cCentre = ws.getCell(row,1);
  cCentre.value = 'CPMI DE GRAND-BASSAM  —  Centre de Protection Mère et Infantile';
  sC(cCentre, {bg:BLU, fg:WHT, bold:true, size:13, ha:'center'});
  row++;

  // Sous-titre + type analyse (2 colonnes)
  // ✅ v13.58 — Badge = catégorie d'analyse (courte), pas la liste des examens.
  //   Hauteur de ligne adaptative pour éviter tout débordement sur le titre.
  const subT = "Laboratoire d'analyses médicales  ·  Grand-Bassam, Côte d'Ivoire";
  const badgeType = (r.type && r.type !== 'Dossier') ? r.type : (sheetName || getDisplayType(r));
  const typeT = 'RÉSULTAT : ' + String(badgeType).toUpperCase();
  const hdrLines = Math.max(neededLines(subT, spanWidth(1,4)), neededLines(typeT, spanWidth(5,NC)));
  ws.getRow(row).height = Math.max(17, hdrLines * 12 + 4);
  mg(row,1,row,4);
  const cSub = ws.getCell(row,1);
  cSub.value = subT;
  sC(cSub, {bg:BLU, fg:'FFBFDBFE', size:9, italic:true});
  mg(row,5,row,NC);
  const cType = ws.getCell(row,5);
  cType.value = typeT;
  sC(cType, {bg:BLU, fg:'FFFBBF24', bold:true, size:10, ha:'right'});
  row++;

  // Liseré or bas
  ws.getRow(row).height = 5;
  for (let c=1;c<=NC;c++) ws.getCell(row,c).fill={type:'pattern',pattern:'solid',fgColor:{argb:GLD}};
  row++;

  // ════════════════════════════════════════════════════
  // BLOC 2 — NOM DU PATIENT (très visible, en MAJUSCULES)
  // ════════════════════════════════════════════════════
  row++; // espace
  // ✅ v12.2 — police 18 ≈ caractères 2x plus larges : largeur effective divisée par 2
  // ✅ v13.62 — nom encore plus grand et mis en valeur
  ws.getRow(row).height = Math.max(30, neededLines(nomMAJ, Math.floor(spanWidth(1,NC)/2.3)) * 20 + 6);
  mg(row,1,row,NC);
  const cNom = ws.getCell(row,1);
  cNom.value = nomMAJ;
  sC(cNom, {bg:PAT_LABEL, fg:BLU, bold:true, size:23, ha:'center'});
  cNom.border = { top:{style:'medium',color:{argb:BLU}}, bottom:{style:'medium',color:{argb:BLU}},
    left:tB().left, right:tB().right };
  row++;

  // ════════════════════════════════════════════════════
  // BLOC 3 — FICHE PATIENT (grille 2×3)
  // ════════════════════════════════════════════════════
  // ✅ v13.62 — cases patient plus compactes (police et hauteur réduites)
  const LS = {bg:PAT_LABEL, fg:SEC_FG, bold:true, size:8.5, border:true};
  const VS = {bg:PAT_VAL,   fg:DARK,   size:9,    border:true};

  function patRow2(l1,v1,l2,v2) {
    const rr = ws.getRow(row);
    // ✅ v13.63 — cases patient encore plus compactes (hauteur réduite par ligne)
    const _pl = Math.min(4, Math.max(
      neededLines(l1, spanWidth(1,1)), neededLines(v1||'—', spanWidth(2,3)),
      neededLines(l2||'', spanWidth(4,4)), neededLines(v2||'—', spanWidth(5,NC))));
    rr.height = Math.max(13, _pl * 10.5 + 2);
    sC(rr.getCell(1),LS); rr.getCell(1).value = l1;
    mg(row,2,row,3); sC(rr.getCell(2),VS); rr.getCell(2).value = v1||'—';
    if (l2 !== undefined) {
      sC(rr.getCell(4),LS); rr.getCell(4).value = l2;
      mg(row,5,row,NC); sC(rr.getCell(5),{...VS,bold:(l2==='N° Dossier')}); rr.getCell(5).value = v2||'—';
    }
    row++;
  }

  patRow2('N° Dossier',        p.dossier,  'Date de prélèvement', dateF);
  patRow2('Âge / Sexe',        ageSexeF,   'Médecin prescripteur', p.medecin);
  patRow2('Service / Unité',   p.service,  'Renseignements cliniques', p.clinique || '');

  row++; // espace

  // ════════════════════════════════════════════════════
  // HELPERS RÉSULTATS
  // ════════════════════════════════════════════════════
  let alt = false;

  let _firstSec = true; // ✅ v13.62 — pas d'espace avant le 1er examen
  function secHdr(title) {
    // ✅ v13.63 — plus d'air entre deux examens (avant chaque section sauf la 1ère)
    if (!_firstSec) { ws.getRow(row).height = 18; row++; }
    _firstSec = false;
    ws.getRow(row).height = 17;
    mg(row,1,row,NC);
    const c = ws.getCell(row,1);
    c.value = title.replace(/[^\w\s\-–·'àâäéèêëîïôùûüç%°()\/,.:]/g, '').trim();
    sC(c, {bg:SEC_BG, fg:SEC_FG, bold:true, size:10});
    c.border = { top:{style:'medium',color:{argb:BLU}}, bottom:{style:'thin',color:{argb:BLU}},
      left:tB().left, right:tB().right };
    row++;
    alt = false;
  }

  // tblHdr : mêmes fusions que pRow pour éviter tout conflit ExcelJS
  function tblHdr(label, valeur, unite, ref) {
    const rr = ws.getRow(row); rr.height = 15;
    const th = {bg:TH_BG, fg:TH_FG, bold:true, size:9, wt:false};
    sC(rr.getCell(1), {...th, ha:'left'});   rr.getCell(1).value = label  || 'Paramètre';
    sC(rr.getCell(2), {...th, ha:'center'}); rr.getCell(2).value = valeur || 'Valeur';
    sC(rr.getCell(3), {...th, ha:'center'}); rr.getCell(3).value = unite  || 'Unité';
    mg(row,4,row,NC);
    sC(rr.getCell(4), {...th, ha:'center'}); rr.getCell(4).value = ref    || 'Valeurs normales';
    row++;
  }

  function pRow(nom, valeur, unite, ref, interp) {
    if (!valeur || valeur.toString().trim() === '') return;
    alt = !alt;
    const bg = alt ? PAR_A : PAR_W;
    // ✅ v13.18 — valeur colorée si anormale (pas de colonne Interprétation)
    let vBg = bg, vFg = DARK;
    const il = (interp||'').toLowerCase();
    if (il.includes('élevé')||il.includes('eleve')||il.includes('positif')||il.includes('anormal'))
      { vBg = HI_BG; vFg = HI_FG; }
    else if (il.includes('bas'))
      { vBg = LO_BG; vFg = LO_FG; }
    else if (il.includes('normal'))
      { vBg = OK_BG; vFg = OK_FG; }
    const rr = ws.getRow(row);
    rr.height = fitH([
      {text:nom, c1:1}, {text:valeur, c1:2}, {text:unite, c1:3}, {text:ref, c1:4, c2:NC}
    ], 16);
    sC(rr.getCell(1), {bg,    fg:DARK,  size:9.5, border:true}); rr.getCell(1).value = nom;
    sC(rr.getCell(2), {bg:vBg, fg:vFg,  bold:true, size:11, ha:'center', border:true}); rr.getCell(2).value = valeur;
    sC(rr.getCell(3), {bg,    fg:MUTED, size:9,    ha:'center', border:true}); rr.getCell(3).value = unite||'';
    mg(row,4,row,NC);
    sC(rr.getCell(4), {bg,    fg:MUTED, size:9,    ha:'center', border:true}); rr.getCell(4).value = ref||'';
    row++;
  }

  // ✅ v12.4 — Ligne vide (examen demandé, résultat à remplir à la main)
  function pRowEmpty(nom, unite, ref) {
    alt = !alt;
    const bg = alt ? PAR_A : PAR_W;
    const rr = ws.getRow(row);
    rr.height = fitH([{text:nom, c1:1}, {text:ref, c1:4, c2:NC}], 18);
    sC(rr.getCell(1), {bg, fg:DARK, size:9.5, border:true}); rr.getCell(1).value = nom;
    sC(rr.getCell(2), {bg:'FFFFFFFF', fg:DARK, border:true}); rr.getCell(2).value = '';
    sC(rr.getCell(3), {bg, fg:MUTED, size:9, ha:'center', border:true}); rr.getCell(3).value = unite||'';
    mg(row,4,row,NC);
    sC(rr.getCell(4), {bg, fg:MUTED, size:9, ha:'center', border:true}); rr.getCell(4).value = ref||'';
    row++;
  }

  function fRow(label, value) {
    const rr = ws.getRow(row);
    rr.height = fitH([{text:label, c1:1}, {text:value, c1:2, c2:NC}], 15); // ✅ v12.2
    sC(rr.getCell(1), {bg:PAT_LABEL, fg:SEC_FG, bold:true, size:9, border:true}); rr.getCell(1).value = label;
    mg(row,2,row,NC);
    sC(rr.getCell(2), {bg:PAT_VAL, fg:DARK, size:9.5, border:true}); rr.getCell(2).value = value;
    row++;
  }

  function nRow(text, bgColor) {
    if (!text||text==='—') return;
    const rr = ws.getRow(row);
    rr.height = fitH([{text, c1:1, c2:NC}], 20); // ✅ v12.2 — observations multi-lignes
    mg(row,1,row,NC);
    const c = rr.getCell(1);
    sC(c, {bg:bgColor||'FFFFFDE7', fg:'FF78350F', italic:true, size:9.5, border:true});
    c.value = text;
    row++;
  }

  // abgRow : la case valeur (S/I/R) colorée directement
  function abgRow(nom, val) {
    if (!val||val==='nd') return;
    alt = !alt;
    const bg = alt ? PAR_A : PAR_W;
    const label = val==='S'?'Sensible':val==='I'?'Intermédiaire':val==='R'?'Résistant':val;
    let vBg=bg, vFg=DARK;
    if (val==='S'){vBg=OK_BG;vFg=OK_FG;}
    else if (val==='R'){vBg=HI_BG;vFg=HI_FG;}
    else if (val==='I'){vBg='FFFFFBEB';vFg='FFB45309';}
    const rr = ws.getRow(row);
    rr.height = fitH([{text:nom, c1:1}, {text:label, c1:2, c2:NC}], 15); // ✅ v12.2
    sC(rr.getCell(1),{bg,fg:DARK,size:9.5,border:true}); rr.getCell(1).value=nom;
    mg(row,2,row,NC);
    sC(rr.getCell(2),{bg:vBg,fg:vFg,bold:true,size:10.5,ha:'center',border:true}); rr.getCell(2).value=label;
    row++;
  }

  // ════════════════════════════════════════════════════
  // CONTENU PAR TYPE D'ANALYSE
  // ════════════════════════════════════════════════════

  if (r.type === 'Hématologie') {
    const nfsVals = [...HEMA_PARAMS,...HEMA_FL].filter(q=>res[q.name]&&res[q.name].valeur);
    if (nfsVals.length) {
      secHdr('NFS — Numération Formule Sanguine');
      tblHdr('Paramètre', 'Valeur', 'Unité', 'Valeurs normales');
      nfsVals.forEach(q => {
        const v=res[q.name];
        const val = v.valeur; // ✅ v13.25 — valeur absolue directement
        pRow(q.name, val, getUnit(q.id, v.unite||q.unit||''), refDisplayFor(q, profile), v.interp||'');
      });
      row++;
    }
    const ephbNames=['Hb A','Hb A2','Hb F','Hb S','Hb C','Hb D','Hb E'].filter(n=>res[n]&&res[n].valeur);
    if (ephbNames.length||res['Profil Hb']) {
      secHdr("Electrophorese de l'Hemoglobine");
      tblHdr('Fraction', '%', '', 'Valeur normale');
      ephbNames.forEach(n=>{const v=res[n]; pRow(n,v.valeur,'%','',v.interp||'');});
      if (res['Profil Hb'])       fRow('Profil',res['Profil Hb']);
      if (res['Commentaire Hb'])  nRow(res['Commentaire Hb']);
      row++;
    }
    if (res['GE - Résultat']||res['GE - TDR']) {
      secHdr('Goutte Epaisse / Parasitologie');
      tblHdr('Paramètre', 'Résultat', '', '');
      if (res['GE - Résultat'])   pRow('Résultat GE',res['GE - Résultat'],'','','');
      if (res['GE - TDR'])        pRow('TDR Paludisme',res['GE - TDR'],'','','');
      if (res['GE - Espèce'])     pRow('Espèce plasmodiale',res['GE - Espèce'],'','','');
      if (res['GE - Parasitémie (%)']) pRow('Parasitémie',res['GE - Parasitémie (%)'],'%','','');
      if (res['GE - Densité parasitaire (/µL)']) pRow('Densité parasitaire',res['GE - Densité parasitaire (/µL)'],'/µL','','');
      if (res['GE - Stade'])      pRow('Stade',res['GE - Stade'],'','','');
      if (res['GE - Observation']) nRow(res['GE - Observation']);
      row++;
    }
    if (res['Groupe ABO'] || res['Rhésus']) {
      secHdr('Groupe Sanguin ABO / Rhésus');
      tblHdr('Paramètre', 'Résultat', '', '');
      if (res['Groupe ABO']) pRow('Groupe ABO', res['Groupe ABO'], '', '', '');
      if (res['Rhésus'])     pRow('Rhésus',     res['Rhésus'],     '', '', '');
      if (res['Commentaire GS']) nRow(res['Commentaire GS']);
      row++;
    }
    if (res['CRP - Valeur']) {
      secHdr('CRP — Protéine C-réactive (Latex)');
      tblHdr('Test', 'Résultat', '', '');
      const crpL = res['CRP - Valeur']==='neg'?'Négatif (< 6 mg/L)':res['CRP - Valeur']+' mg/L';
      const crpI = (res['CRP - Interprétation']||'').replace(/^[^\w]+/,'');
      pRow('CRP Latex', crpL, 'mg/L', '< 6', crpI);
      row++;
    }
    const _wid = widalReport(res);
    if (_wid.show) {
      secHdr('Sérodiagnostic de Widal & Felix');
      if (_wid.rows.length) {
        tblHdr('Antigène', 'Titre', 'Cinétique', 'Commentaire');
        _wid.rows.forEach(w => pRow(w.name, w.titre, w.cinetique || '—', '', w.interp || ''));
      }
      if (_wid.concl) nRow(_wid.concl.replace(/^[^\w]+/, ''), _wid.concl.includes('ÉTAT') || _wid.concl.includes('DÉBUT') ? 'FFFFF1F1' : 'FFFFFDE7');
      row++;
    }

  } else if (r.type === 'Biochimie') {
    const bioSections = [
      {label:'Glucides', params:BIO_GLUCIDES},
      {label:'Fonction rénale', params:BIO_REIN},
      {label:'Fonction hépatique & Pancréas', params:BIO_FOIE},
      {label:'Lipides', params:BIO_LIPIDES},
      {label:'Ionogramme & Minéraux', params:BIO_IONO},
      {label:'Fer & Hémostase', params:[...BIO_FER,...BIO_COAG]},
      {label:'Marqueurs cardiaques', params:BIO_CARD},
      {label:'Hormones & Vitamines', params:BIO_HORM},
      {label:'Autres marqueurs', params:BIO_AUTRE},
    ];
    bioSections.forEach(sec => {
      const vals = sec.params.filter(q=>res[q.name]&&res[q.name].valeur);
      if (!vals.length) return;
      secHdr('Biochimie — ' + sec.label);
      tblHdr('Paramètre', 'Valeur', 'Unité', 'Valeurs normales');
      vals.forEach(q=>{const v=res[q.name]; pRow(q.name,v.valeur,getUnit(q.id,v.unite||q.unit||''),refDisplayFor(q,profile),v.interp||'');});
      row++;
    });

  } else if (r.type === 'Bactériologie') {
    if (res['Type de prélèvement']) fRow('Type de prélèvement', res['Type de prélèvement']);
    if (res['Site / Précision'])    fRow('Site / Précision', res['Site / Précision']);
    // Macroscopie
    const macroFields = ['Aspect','Couleur','Odeur','pH'];
    const macroVals = macroFields.filter(k=>res[k]&&res[k]!=='—');
    if (macroVals.length) {
      secHdr('Macroscopie');
      tblHdr('Paramètre', 'Résultat', '', '');
      macroVals.forEach(k=>pRow(k,res[k],'','',''));
      row++;
    }
    // État frais
    const efFields=['Leucocytes (/mm³)','Hématies (/mm³)','Cellules épithéliales','Bactéries (état frais)','Levures'];
    const efVals = efFields.filter(k=>res[k]&&res[k]!=='—'&&res[k]!=='Absents'&&res[k]!=='Absentes');
    if (efVals.length) {
      secHdr('État frais — Cytologie');
      tblHdr('Élément', 'Résultat', 'Unité', '');
      if (res['Leucocytes (/mm³)']) pRow('Leucocytes',res['Leucocytes (/mm³)'],'/mm³','','');
      if (res['Hématies (/mm³)'])   pRow('Hématies',res['Hématies (/mm³)'],'/mm³','','');
      efVals.filter(k=>!k.startsWith('Leuco')&&!k.startsWith('Héma')).forEach(k=>pRow(k,res[k],'','',''));
      row++;
    }
    // Gram
    if (res['Coloration de Gram']&&res['Coloration de Gram']!=='neg') {
      secHdr('Coloration de Gram');
      tblHdr('Résultat Gram', 'Abondance', '', '');
      pRow(res['Coloration de Gram'], res['Gram - Abondance']||'—','','','');
      if (res['Gram - Commentaire']) nRow(res['Gram - Commentaire']);
      row++;
    }
    // Culture
    if (res['Culture']||res['Germe identifié']) {
      secHdr('Culture & Identification');
      tblHdr('Paramètre', 'Résultat', '', '');
      if (res['Culture'])            pRow('Culture',res['Culture'],'','','');
      if (res['Numération bactérienne']) pRow('Numération',res['Numération bactérienne'],'','','');
      if (res['Germe identifié'])    pRow('Germe identifié',res['Germe identifié'],'','','');
      if (res['2ème germe'])         pRow('2ème germe',res['2ème germe'],'','','');
      row++;
    }
    // Antibiogramme
    const abgD = ABG_ANTIBIOS.filter(ab=>res['ABG_'+ab]&&res['ABG_'+ab]!=='nd');
    if (abgD.length) {
      secHdr('Antibiogramme');
      tblHdr('Antibiotique', 'Résultat', '', '');
      abgD.forEach(ab=>abgRow(ab,res['ABG_'+ab]));
      if (res['Commentaire antibiogramme']) nRow(res['Commentaire antibiogramme']);
      row++;
    }
    const afgD = AFG_ANTIFONGIQUES.filter(af=>res['AFG_'+af]&&res['AFG_'+af]!=='nd');
    if (afgD.length) {
      secHdr('Antifongigramme');
      tblHdr('Antifongique', 'Résultat', '', '');
      afgD.forEach(af=>abgRow(af,res['AFG_'+af]));
      row++;
    }

  } else if (r.type === 'Immuno-Sérologie') {
    const seroVals = (typeof SERO_TESTS!=='undefined') ? SERO_TESTS.filter(t=>{const v=res[t.name];return v&&(v.resultat||v.valeur);}) : [];
    if (seroVals.length) {
      secHdr('Sérologies');
      tblHdr('Test', 'Résultat', 'Valeur', '');
      seroVals.forEach(t=>{
        const v=res[t.name];
        const interp = v.resultat==='Positif'?'Positif' : v.resultat==='Négatif'?'Négatif' : v.resultat||'';
        pRow(t.name, v.resultat||v.valeur||'', t.unit||'', '', interp);
      });
      row++;
    }
    // ✅ v13.37 — CRP / Widal / Groupe sanguin manquaient dans l'export Excel.
    if (res['CRP - Valeur']) {
      secHdr('CRP — Protéine C-réactive (Latex)');
      tblHdr('Test', 'Résultat', 'Unité', 'Valeurs normales');
      const _crp = res['CRP - Valeur'] === 'neg' ? 'Négatif (< 6 mg/L)' : res['CRP - Valeur'] + ' mg/L';
      pRow('CRP Latex', _crp, '', '< 6 mg/L', res['CRP - Valeur'] === 'neg' ? 'Normal' : 'Élevé');
      row++;
    }
    if (typeof WIDAL_ANTIGENES !== 'undefined') {
      const _widD = WIDAL_ANTIGENES.filter(ag => { const w = res['Widal - ' + ag.name]; return w && w.titre; });
      if (_widD.length) {
        secHdr('Sérodiagnostic de Widal & Félix (SWF)');
        tblHdr('Antigène', 'Titre', 'Cinétique', 'Commentaire');
        _widD.forEach(ag => { const w = res['Widal - ' + ag.name]; pRow(ag.name, w.titre, w.cinetique || '', w.interp || '', ''); });
        if (res['Widal - Conclusion']) nRow(res['Widal - Conclusion']);
        row++;
      }
    }
    const _sAbo = res['Groupe ABO'] || res['GS - ABO'];
    const _sRh  = res['Rhésus'] || res['GS - Rhésus'];
    if (_sAbo || _sRh) {
      secHdr('Groupe Sanguin ABO / Rhésus');
      tblHdr('Paramètre', 'Résultat', '', '');
      if (_sAbo) pRow('Groupe ABO', _sAbo, '', '', '');
      if (_sRh)  pRow('Rhésus', _sRh, '', '', '');
      row++;
    }

  } else if (r.type === 'Groupe sanguin') {
    secHdr('Groupe Sanguin ABO / Rhésus');
    tblHdr('Paramètre', 'Résultat', '', '');
    if (res['Groupe ABO']) pRow('Groupe ABO', res['Groupe ABO'], '', '', '');
    if (res['Rhésus'])     pRow('Rhésus',     res['Rhésus'],     '', '', '');
    if (res['Commentaire GS']) nRow(res['Commentaire GS']);
    row++;

  } else if (r.type === 'Parasitologie') {
    // ✅ v13.37 — CORRECTIF : lisait des clés inexistantes (« Aspect des selles »,
    // « EPS_… ») → section vide. On lit désormais les vraies clés (collectResults).
    secHdr('Examen Parasitologique / Paludisme');
    tblHdr('Paramètre', 'Résultat', 'Unité', 'Observation');
    if (res["Type d'examen"])           pRow("Type d'examen", res["Type d'examen"], '', '', '');
    if (res['Résultat global'])         pRow('Résultat global', res['Résultat global'], '', '', '');
    if (res['Coloration'])              pRow('Coloration', res['Coloration'], '', '', '');
    if (res['Espèce plasmodiale'])      pRow('Espèce plasmodiale', res['Espèce plasmodiale'], '', '', '');
    if (res['Parasitémie (%)'])         pRow('Parasitémie', res['Parasitémie (%)'], '%', '', '');
    if (res['Densité parasitaire /µL']) pRow('Densité parasitaire', res['Densité parasitaire /µL'], '/µL', '', '');
    if (res['Stade parasitaire'])       pRow('Stade parasitaire', res['Stade parasitaire'], '', '', '');
    if (res['Indice érythrocytaire'])   pRow('Indice érythrocytaire', res['Indice érythrocytaire'], '', '', '');
    if (res['TDR paludisme'])           pRow('TDR paludisme', res['TDR paludisme'], '', '', '');
    if (typeof PARA_EPS !== 'undefined') {
      PARA_EPS.forEach(pa => { const v = res[pa]; if (v && v !== 'Absent' && v !== '') pRow(pa, v, '', '', ''); });
    }
    if (res['Observations']) nRow(res['Observations']);
    row++;

  } else {
    // Rendu générique fallback
    const gRows=[];
    Object.entries(res).forEach(([k,v])=>{
      if (!v||k.startsWith('ABG_')||k.startsWith('AFG_')||k.startsWith('BPNSERO_')||k.startsWith('_')) return; // ✅ v12
      if (typeof v==='object') {
        const val=v.valeur||v.resultat||v.titre||'';
        if (val) gRows.push({n:k,v:val,u:v.unite||'',i:v.interp||v.obs||''});
      } else if (typeof v==='string'&&v&&v!=='—') {
        gRows.push({n:k,v,u:'',i:''});
      }
    });
    if (gRows.length) {
      secHdr(r.type + ' — Résultats');
      tblHdr('Paramètre', 'Résultat', 'Unité', '');
      gRows.forEach(q=>pRow(q.n,q.v,q.u,'',q.i));
      row++;
    }
    const abgD=ABG_ANTIBIOS.filter(ab=>res['ABG_'+ab]&&res['ABG_'+ab]!=='nd');
    if (abgD.length) {
      secHdr('Antibiogramme'); tblHdr('Antibiotique', 'Résultat', '', '');
      abgD.forEach(ab=>abgRow(ab,res['ABG_'+ab])); row++;
    }
    const afgD=AFG_ANTIFONGIQUES.filter(af=>res['AFG_'+af]&&res['AFG_'+af]!=='nd');
    if (afgD.length) {
      secHdr('Antifongigramme'); tblHdr('Antifongique', 'Résultat', '', '');
      afgD.forEach(af=>abgRow(af,res['AFG_'+af])); row++;
    }
  }

  // ✅ v12.4 — Composition BPN (traçabilité des examens inclus, forfait fixe)
  if (Array.isArray(res['_bpn_inclus']) && res['_bpn_inclus'].length) {
    secHdr('Composition du bilan prénatal (forfait ' + (r.montant||20000).toLocaleString('fr-FR') + ' FCFA)');
    res['_bpn_inclus'].forEach(lbl => nRow('☑  ' + lbl, 'FFF0FDFA'));
    row++;
  }

  // ✅ v12.4 — Examens demandés non encore renseignés → affichés vides à compléter
  const pending = getPendingCheckedExams(r, r.type);
  if (pending.length) {
    secHdr('Examens demandés — résultats à compléter');
    pending.forEach(ex => {
      tblHdr(ex.label, 'Résultat', 'Unité', 'Valeurs normales');
      ex.rows.forEach(pr => pRowEmpty(pr.name, pr.unit, pr.ref));
    });
    row++;
  }

  // ════════════════════════════════════════════════════
  // PIED DE PAGE
  // ════════════════════════════════════════════════════
  row++;
  ws.getRow(row).height = 5;
  for (let c=1;c<=NC;c++) ws.getCell(row,c).fill={type:'pattern',pattern:'solid',fgColor:{argb:GLD}};
  row++;

  ws.getRow(row).height = 13;
  mg(row,1,row,3);
  const cFt = ws.getCell(row,1);
  cFt.value = 'Édité le ' + new Date().toLocaleDateString('fr-FR') + '  —  CPMI de Grand-Bassam';
  sC(cFt, {fg:MUTED, size:8, italic:true});

  mg(row,4,row,NC);
  const cMontant = ws.getCell(row,4);
  if (r.montant) {
    cMontant.value = 'Montant : ' + r.montant.toLocaleString('fr-FR') + ' FCFA';
    sC(cMontant, {fg:'FF15803D', bold:true, size:9, ha:'right'});
  }
  row++; row++;

  // Zones signature
  ws.getRow(row).height = 14;
  mg(row,1,row,3); sC(ws.getCell(row,1),{bg:PAT_LABEL,fg:SEC_FG,bold:true,size:9});
  ws.getCell(row,1).value='Commentaire du technicien :';
  mg(row,4,row,NC); sC(ws.getCell(row,4),{bg:PAT_LABEL,fg:SEC_FG,bold:true,size:9});
  ws.getCell(row,4).value='Signature du technicien :';
  row++;
  const sigStartRow = row; // ✅ v13.37 — ancre pour l'image de signature + QR
  for (let i=0;i<4;i++) {
    ws.getRow(row).height=14;
    mg(row,1,row,3); ws.getCell(row,1).border=tB(BRD);
    mg(row,4,row,NC); ws.getCell(row,4).border=tB(BRD);
    row++;
  }
  // ✅ v13.37 — Nom (façon signature) + titre sous la ligne de signature,
  // et QR : les IMAGES sont ajoutées ensuite par addQrAndSignatures(wb).
  const _techName = (typeof _currentUser !== 'undefined' && _currentUser?.username)
    ? _currentUser.username.toUpperCase() : '';
  const _refDoc = getOrCreateRef(r);
  ws.getCell(sigStartRow + 2, 4).value = _techName || '—';
  sC(ws.getCell(sigStartRow + 2, 4), { fg: SEC_FG, bold: true, size: 9 });
  ws.getCell(sigStartRow + 3, 4).value = 'Technicien de laboratoire · CPMI Grand-Bassam';
  sC(ws.getCell(sigStartRow + 3, 4), { fg: MUTED, italic: true, size: 7.5 });
  // ✅ v13.65 — QR : on retire la ligne ANALYSE et on affiche le montant payé
  const _payInfos = p.paiement_infos || {};
  const _recu = Number(_payInfos.montant_recu);
  const _payeStr = (p.paiement_status === 'paye' && !isNaN(_recu) && _recu > 0)
    ? _recu.toLocaleString('fr-FR') + ' FCFA'
    : 'NON PAYÉ';
  // ✅ v13.66 — QR allégé : on garde le DOSSIER (pas la REF) et un seul mot du nom
  const _nomCourt = (nomMAJ.split(/\s+/)[0] || nomMAJ);
  ws._qrSig = {
    sigRow: sigStartRow,
    techName: _techName,
    refDoc: _refDoc,
    NC: NC,
    qrContent: 'CPMI GRAND-BASSAM\nDOSSIER: ' + (p.dossier || '—')
      + '\nPATIENT: ' + _nomCourt + '\nPAYE: ' + _payeStr + '\nDATE: ' + dateF
      + (_techName ? ('\nTECH: ' + _techName) : '')
  };

  // ✅ v13.60 — Remplissage adaptatif, valable pour TOUS les onglets :
  //   • Rapport COURT (tient sur une page) → on agrandit les lignes pour
  //     remplir exactement UNE page A4 (aucun espace vide) et on la verrouille
  //     sur une page (fitToHeight:1).
  //   • Rapport LONG (dépasse une page) → on ne touche à rien : il garde sa
  //     taille normale, lisible, et s'étale naturellement sur 2 pages
  //     (fitToHeight:0). Concerne biochimie, bactériologie/ATB, immuno, hormones.
  (function fillPage() {
    const lastRow = row - 1;
    if (lastRow < 3) return;
    // ✅ v13.61 — TAILLE STANDARD FIXE (même densité pour tous les onglets).
    //   On agrandit chaque ligne d'un facteur constant, calibré pour qu'un
    //   rapport courant (NFS + Goutte épaisse) remplisse ~90 % d'une page A4.
    //   • Rapport plus court (ex. CRP seule) : laisse un peu d'espace en bas.
    //   • Rapport plus long (biochimie, ATB, immuno, hormones) : garde la même
    //     taille de ligne et s'étale naturellement sur 2 pages.
    const STD = (typeof window !== 'undefined' && window.__stdFactor) ? window.__stdFactor : 1.49;
    for (let i = 1; i <= lastRow; i++) {
      const rr = ws.getRow(i);
      const h = (rr.height != null ? rr.height : 15);
      rr.height = Math.round(h * STD * 10) / 10;
    }
    ws.pageSetup.fitToHeight = 0; // jamais de compression : long => 2 pages
  })();
}


// Vérifie que la bibliothèque ExcelJS (chargée depuis un CDN) est bien
// disponible avant de tenter un export — évite un échec silencieux si
// la connexion internet est coupée ou trop lente au moment du clic.
// ✅ v13.35 — Code impression/export déplacé dans print.js
function getTarifsRef() {
  try { return JSON.parse(localStorage.getItem('tarifs_ref') || 'null') || buildTarifsRefDefault(); }
  catch(e) { return buildTarifsRefDefault(); }
}
function saveTarifsRef(t) { localStorage.setItem('tarifs_ref', JSON.stringify(t)); }

function buildTarifsRefDefault() {
  const ref = {};
  CATALOGUE_EXAMENS.forEach(ex => { ref[ex.id] = ex.prix; });
  return ref;
}

// Examens personnalisés ajoutés par l'admin
function getExamensCustom() {
  try { return JSON.parse(localStorage.getItem('examens_custom') || '[]'); }
  catch(e) { return []; }
}
function saveExamensCustom(list) { localStorage.setItem('examens_custom', JSON.stringify(list)); }

// Catalogue complet = défauts + personnalisés
function getCatalogueComplet() {
  return [...CATALOGUE_EXAMENS, ...getExamensCustom()];
}

function showAddExamenModal() {
  const modal = document.getElementById('add-examen-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('new_ex_label').value = '';
    document.getElementById('new_ex_prix').value = '0';
  }
}

function addExamenPersonnalise() {
  const label = document.getElementById('new_ex_label')?.value?.trim();
  if (!label) { toast('Le nom de l\'examen est obligatoire', 'err'); return; }

  const tabVal = document.getElementById('new_ex_groupe')?.value || 'other';
  const prix   = parseInt(document.getElementById('new_ex_prix')?.value || '0');
  const id     = 'custom_' + Date.now();

  const tabToGroupe = {
    hema:'🩸 Hématologie', bio:'🧪 Biochimie', sero:'💉 Immuno-Sérologie',
    bacterio:'🦠 Bactériologie', parasito:'🦟 Parasitologie',
    gs:'🩸 Groupe sanguin', other:'🔬 Autres'
  };
  const groupe = tabToGroupe[tabVal] || '🔬 Autres';
  const tab    = tabVal === 'other' ? 'hema' : tabVal;

  const custom = getExamensCustom();
  custom.push({ id, label, groupe, prix, tab, custom: true });
  saveExamensCustom(custom);

  const ref = getTarifsRef();
  ref[id] = prix;
  saveTarifsRef(ref);

  document.getElementById('add-examen-modal').style.display = 'none';
  document.getElementById('new_ex_label').value = '';
  document.getElementById('new_ex_prix').value = '0';
  buildAdminExamensGrid();
  buildFicheExamens();
  toast('Examen "' + label + '" ajouté ✓', 'ok');
}

function removeExamenCustom(id) {
  if (!confirm('Supprimer cet examen personnalisé ?')) return;
  const custom = getExamensCustom().filter(ex => ex.id !== id);
  saveExamensCustom(custom);
  const ref = getTarifsRef();
  delete ref[id];
  saveTarifsRef(ref);
  buildAdminExamensGrid();
  buildFicheExamens();
  toast('Examen supprimé', 'ok');
}

// Recharge les prix de la fiche d'accueil depuis les tarifs de référence
function rechargeFichePrix() {
  const ref = getTarifsRef();
  getCatalogueComplet().forEach(ex => {
    const el = document.getElementById('px_' + ex.id);
    if (el) el.value = ref[ex.id] !== undefined ? ref[ex.id] : ex.prix;
  });
  calcFicheTotal();
}

// ── Grille admin (Comptes) ─────────────────────────────────────
function buildAdminExamensGrid() {
  const grid = document.getElementById('admin-examens-grid');
  if (!grid) return;
  const ref     = getTarifsRef();
  const custom  = getExamensCustom();

  // Grouper par catégorie (catalogue complet)
  const groupes = {};
  getCatalogueComplet().forEach(ex => {
    if (!groupes[ex.groupe]) groupes[ex.groupe] = [];
    groupes[ex.groupe].push(ex);
  });

  grid.innerHTML = Object.entries(groupes).map(([groupe, examens]) => `
    <div class="exam-group-card">
      <div class="exam-group-title">${groupe}</div>
      ${examens.map(ex => {
        const prix       = ref[ex.id] !== undefined ? ref[ex.id] : ex.prix;
        const isCustom   = !!ex.custom;
        const removeBtn  = isCustom
          ? `<button onclick="removeExamenCustom('${ex.id}')" title="Supprimer cet examen" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:15px;padding:2px 4px;line-height:1;border-radius:4px;transition:background .15s" onmouseover="this.style.background='var(--danger-light)'" onmouseout="this.style.background='none'">✕</button>`
          : '';
        return `<div style="display:flex;align-items:center;gap:6px;padding:6px 4px;border-bottom:1px dashed rgba(199,215,245,.5);border-radius:6px;transition:background .15s" onmouseover="this.style.background='rgba(224,234,255,.4)'" onmouseout="this.style.background='none'">
          <label style="flex:1;font-size:12.5px;font-weight:${isCustom?'600':'500'};color:var(--text)">
            ${ex.label}${isCustom ? '<span style="font-size:9px;background:var(--accent-light);color:var(--cpmi-mid);border-radius:4px;padding:1px 5px;margin-left:4px">+</span>' : ''}
            ${ex.note ? `<span style="font-size:10px;color:var(--text-muted);font-style:italic"> (${ex.note})</span>` : ''}
          </label>
          <input type="number" id="adm_px_${ex.id}" value="${prix}" min="0" step="100"
            style="width:80px;text-align:right;font-weight:700;color:var(--cpmi-deep);font-size:12.5px;padding:4px 6px">
          <span style="font-size:10.5px;color:var(--text-muted);flex-shrink:0">F</span>
          ${removeBtn}
        </div>`;
      }).join('')}
    </div>`).join('');
}

function saveAdminTarifs() {
  const ref = getTarifsRef();
  getCatalogueComplet().forEach(ex => {
    const el = document.getElementById('adm_px_' + ex.id);
    if (el) ref[ex.id] = parseInt(el.value) || 0;
  });
  saveTarifsRef(ref);
  rechargeFichePrix();
  toast('Prix de référence enregistrés ✓ — Fiche d\'accueil mise à jour', 'ok');
}

function resetAdminTarifs() {
  if (!confirm('Remettre tous les prix aux valeurs par défaut ? Les examens personnalisés seront conservés.')) return;
  localStorage.removeItem('tarifs_ref');
  buildAdminExamensGrid();
  rechargeFichePrix();
  toast('Prix réinitialisés aux valeurs par défaut', 'ok');
}

// Compatibilité
function renderTarifsConfig() { buildAdminExamensGrid(); }
function saveTarifsConfig()   { saveAdminTarifs(); }
function resetTarifsConfig()  { resetAdminTarifs(); }

// ──────────────────────────────────────────────────────────────
// PRESCRIPTEURS
// ──────────────────────────────────────────────────────────────



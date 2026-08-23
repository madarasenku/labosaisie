// ============================================================
//  GRILLE PAILLASSE PAR EXAMEN — saisie en série (v13.120)
//
//  Une ligne par patient, une colonne par paramètre, pour l'examen
//  choisi dans le sélecteur. On ne liste QUE les dossiers dont ce
//  paramètre est demandé mais pas encore rempli : « si je suis à la
//  NFS je remplis, si je suis à la CRP je remplis au fur et à mesure ».
//
//  Correction garantie : chaque ligne est « rejouée » dans le vrai
//  formulaire de saisie (mêmes handlers/interprétations) puis
//  collectResults(type) produit exactement le même JSON qu'une saisie
//  normale. La grille n'est qu'une surface de saisie rapide.
// ============================================================

// Options du sélecteur CRP (identiques au formulaire).
const _CRP_OPTS = [
  ['', '—'], ['neg', 'Négatif (< 6)'], ['6', '6'], ['12', '12'], ['24', '24'],
  ['48', '48'], ['96', '96'], ['192', '192'], ['384', '≥ 384'],
];

// Registre des examens saisissables en série.
//  type    : analyse de stockage (clé dans resultats)
//  exId    : examen à cocher lors du rejeu
//  coche   : regex pour repérer l'examen dans _examens_coches[type]
//  filled  : (resultatsDuType) => valeur déjà saisie ? (=> exclu de la liste)
//  cols    : colonnes { k, lab, dom, kind:'num'|'sel', opts? }
//  before  : réglage éventuel avant le rejeu (ex. mode quantitatif)
const GRILLE_EXAMS = {
  nfs: {
    label: 'NFS — Hémogramme', type: 'Hématologie', exId: 'ex_nfs', coche: /NFS/i,
    filled: h => h['Globules blancs (GB)'] && h['Globules blancs (GB)'].valeur,
    cols: [
      { k: 'gbc', lab: 'GB', dom: 'v_gbc', kind: 'num' },
      { k: 'gr',  lab: 'GR', dom: 'v_gr',  kind: 'num' },
      { k: 'hb',  lab: 'Hb', dom: 'v_hb',  kind: 'num' },
      { k: 'ht',  lab: 'Ht', dom: 'v_ht',  kind: 'num' },
      { k: 'plt', lab: 'Plq', dom: 'v_plt', kind: 'num' },
      { k: 'pnn', lab: 'PNN %', dom: 'v_pnn', kind: 'num' },
      { k: 'pne', lab: 'PNE %', dom: 'v_pne', kind: 'num' },
      { k: 'pnb', lab: 'PNB %', dom: 'v_pnb', kind: 'num' },
      { k: 'lymp', lab: 'Lymph %', dom: 'v_lymp', kind: 'num' },
      { k: 'mono', lab: 'Mono %', dom: 'v_mono', kind: 'num' },
    ],
  },
  crp: {
    label: 'CRP', type: 'Immuno-Sérologie', exId: 'ex_crp', coche: /CRP/i,
    filled: s => s['CRP - Valeur'],
    cols: [{ k: 'crp', lab: 'CRP (mg/L)', dom: 'crp_valeur', kind: 'sel', opts: _CRP_OPTS }],
  },
  gly: {
    label: 'Glycémie à jeun', type: 'Biochimie', exId: 'ex_gly', coche: /Glyc/i,
    filled: b => b['Glycémie à jeun'] && b['Glycémie à jeun'].valeur,
    cols: [{ k: 'gly', lab: 'Glycémie (g/L)', dom: 'v_gly', kind: 'num' }],
  },
  crea: {
    label: 'Créatinine', type: 'Biochimie', exId: 'ex_crea', coche: /Créat|Creat/i,
    filled: b => b['Créatinine'] && b['Créatinine'].valeur,
    cols: [{ k: 'crea', lab: 'Créatinine (mg/L)', dom: 'v_crea', kind: 'num' }],
  },
  uree: {
    label: 'Urée', type: 'Biochimie', exId: 'ex_uree', coche: /Urée|Uree/i,
    filled: b => b['Urée'] && b['Urée'].valeur,
    cols: [{ k: 'uree', lab: 'Urée (g/L)', dom: 'v_uree', kind: 'num' }],
  },
  tsh: {
    label: 'TSH', type: 'Immuno-Sérologie', exId: 'ex_tsh', coche: /TSH/i,
    filled: s => s['TSH'] && (s['TSH'].valeur || s['TSH'].resultat),
    before: () => { const m = document.getElementById('smode_tsh'); if (m) { m.value = 'quant'; try { m.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} } },
    cols: [{ k: 'tsh', lab: 'TSH (mUI/L)', dom: 'sv_tsh', kind: 'num' }],
  },
};

const _TYPE_TO_TAB = { 'Hématologie': 'hema', 'Biochimie': 'bio', 'Immuno-Sérologie': 'sero', 'Parasitologie': 'parasito', 'Groupe sanguin': 'gs' };

let _grilleKey = 'nfs';

// Dossiers où l'examen `key` est demandé mais pas encore rempli.
function grillePending(key) {
  const cfg = GRILLE_EXAMS[key]; if (!cfg) return [];
  let db; try { db = getDB(); } catch (e) { db = []; }
  return db.filter(r => {
    if (!isDossierRecord(r) || r.deletedAt || r._hardDeleted) return false;
    const coches = r.resultats?._examens_coches?.[cfg.type] || [];
    if (!coches.some(l => cfg.coche.test(l))) return false;
    const res = r.resultats?.[cfg.type] || {};
    return !cfg.filled(res);          // pas encore rempli
  });
}
// Compat : ancienne entrée NFS.
function grillePendingNFS() { return grillePending('nfs'); }

// Ouvre la grille sur un examen donné.
function ouvrirGrille(key) {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  if (key && GRILLE_EXAMS[key]) _grilleKey = key;
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  ['fiche-identification', 'zone-saisie', 'paillasse-bar'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  cont.style.display = '';
  grilleRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function ouvrirGrilleNFS() { ouvrirGrille('nfs'); }

// Changement d'examen dans le sélecteur.
async function grilleChangeExam(key) {
  if (!GRILLE_EXAMS[key]) return;
  // Prévenir si des cellules sont saisies mais non enregistrées.
  const saisiEnCours = [...document.querySelectorAll('#grille-serie tr[data-doss]')].some(tr => grilleRowHasAny(tr.dataset.doss));
  if (saisiEnCours && typeof showConfirmModal === 'function') {
    const ok = await showConfirmModal({
      icon: '↔️', title: 'Changer d\'examen ?',
      message: 'Des valeurs saisies non enregistrées seront perdues. Continuer ?',
      confirmText: 'Changer', cancelText: 'Annuler'
    });
    if (!ok) { const sel = document.getElementById('grille-exam-sel'); if (sel) sel.value = _grilleKey; return; }
  }
  _grilleKey = key;
  grilleRender();
}

function fermerGrille() {
  const cont = document.getElementById('grille-serie');
  if (cont) cont.style.display = 'none';
  const fiche = document.getElementById('fiche-identification');
  if (fiche) fiche.style.display = '';
  if (typeof benchRenderBar === 'function') benchRenderBar();
}

function grilleRender() {
  const cfg = GRILLE_EXAMS[_grilleKey];
  const cont = document.getElementById('grille-serie');
  if (!cont || !cfg) return;
  const pend = grillePending(_grilleKey);

  const selecteur = '<select id="grille-exam-sel" onchange="grilleChangeExam(this.value)" '
    + 'style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--cpmi-deep)">'
    + Object.keys(GRILLE_EXAMS).map(k => '<option value="' + k + '"' + (k === _grilleKey ? ' selected' : '') + '>' + esc(GRILLE_EXAMS[k].label) + '</option>').join('')
    + '</select>';

  const entete = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    + '<span style="font-size:15px;font-weight:800;color:var(--cpmi-deep)">📋 Saisie en série</span>' + selecteur
    + '<span style="font-size:13px;color:var(--text-muted)">' + pend.length + ' en attente</span></div>'
    + '<div style="display:flex;gap:8px"><button class="btn btn-outline" style="font-size:13px" onclick="fermerGrille()">← Retour</button>'
    + '<button id="grille-save" class="btn btn-primary" style="font-size:14px;padding:9px 20px" onclick="grilleSaveAll()">💾 Enregistrer le lot</button></div></div>';

  if (!pend.length) {
    cont.innerHTML = entete
      + '<div style="padding:24px;text-align:center;color:var(--text-muted);background:rgba(255,255,255,.7);border:1px dashed var(--border);border-radius:var(--radius)">'
      + 'Aucun dossier « ' + esc(cfg.label) + ' » en attente. Tous les résultats de ce paramètre sont déjà saisis.</div>';
    return;
  }

  const head = '<th style="position:sticky;left:0;background:var(--cpmi-deep);color:#fff;text-align:left;padding:8px 10px;min-width:170px;z-index:2">Patient</th>'
    + cfg.cols.map(c => '<th style="background:var(--cpmi-deep);color:#fff;padding:8px 6px;min-width:70px;font-size:11.5px">' + esc(c.lab) + '</th>').join('');

  const cellHtml = (dossId, c) => {
    if (c.kind === 'sel') {
      return '<td style="padding:3px 4px"><select id="g_' + dossId + '_' + c.k + '" data-doss="' + dossId + '" data-col="' + c.k + '" '
        + 'onchange="grilleCellChange(' + dossId + ')" style="min-width:120px;padding:5px 4px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">'
        + (c.opts || []).map(o => '<option value="' + o[0] + '">' + esc(o[1]) + '</option>').join('') + '</select></td>';
    }
    return '<td style="padding:3px 4px"><input type="number" step="any" inputmode="decimal" '
      + 'id="g_' + dossId + '_' + c.k + '" data-doss="' + dossId + '" data-col="' + c.k + '" '
      + 'oninput="grilleCellChange(' + dossId + ')" '
      + 'style="width:78px;padding:5px 4px;border:1px solid var(--border);border-radius:6px;font-size:12.5px;text-align:center"></td>';
  };

  const rows = pend.map(r => {
    const nom = esc(r.patient?.nom || '—');
    const doss = esc(r.patient?.dossier || '');
    const sexe = esc(r.patient?.sexe || '');
    return '<tr id="grow_' + r.id + '" data-doss="' + r.id + '">'
      + '<td style="position:sticky;left:0;background:#fff;padding:6px 10px;font-weight:600;font-size:12.5px;border-right:1px solid var(--border)">'
      + '<span id="gtick_' + r.id + '" style="color:#15803d;font-weight:800;margin-right:4px;visibility:hidden">✓</span>'
      + nom + '<div style="font-size:10.5px;color:var(--text-muted);font-weight:500">N° ' + doss + (sexe ? ' · ' + sexe : '') + '</div></td>'
      + cfg.cols.map(c => cellHtml(r.id, c)).join('') + '</tr>';
  }).join('');

  cont.innerHTML = entete
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">' + (cfg.type === 'Hématologie'
        ? 'VGM · TCMH · CCMH et valeurs absolues sont calculés automatiquement. ' : '')
      + 'Laissez une ligne vide pour ne pas l\'enregistrer.</div>'
    + '<div id="grille-hint" style="font-size:12px;color:var(--text-muted);margin-bottom:8px"></div>'
    + '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)"><table style="border-collapse:collapse;width:100%;font-size:12.5px"><thead><tr>'
    + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  grilleUpdateHint();
}

function _grilleCols() { return (GRILLE_EXAMS[_grilleKey] || {}).cols || []; }
function grilleRowComplete(dossId) {
  return _grilleCols().every(c => {
    const el = document.getElementById('g_' + dossId + '_' + c.k);
    return el && String(el.value).trim() !== '';
  });
}
function grilleRowHasAny(dossId) {
  return _grilleCols().some(c => {
    const el = document.getElementById('g_' + dossId + '_' + c.k);
    return el && String(el.value).trim() !== '';
  });
}
function grilleCellChange(dossId) {
  const tick = document.getElementById('gtick_' + dossId);
  if (tick) tick.style.visibility = grilleRowComplete(dossId) ? 'visible' : 'hidden';
  grilleUpdateHint();
}
function grilleUpdateHint() {
  const hint = document.getElementById('grille-hint');
  if (!hint) return;
  const rows = [...document.querySelectorAll('#grille-serie tr[data-doss]')];
  const prets = rows.filter(tr => grilleRowComplete(tr.dataset.doss)).length;
  const amorces = rows.filter(tr => grilleRowHasAny(tr.dataset.doss)).length;
  hint.textContent = '✅ ' + prets + ' complète' + (prets > 1 ? 's' : '')
    + ' · ' + amorces + ' commencée' + (amorces > 1 ? 's' : '') + ' sur ' + rows.length;
}

// ── Rejoue une ligne dans le vrai formulaire et renvoie le JSON du type ──
function grilleBuildResults(cfg, dossId, sexe, age) {
  const tab = _TYPE_TO_TAB[cfg.type] || 'hema';
  if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt(tab);
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  setV('p_sexe', sexe || ''); setV('p_age', age == null ? '' : age);
  try { getCatalogueComplet().forEach(ex => { const c = document.getElementById(ex.id); if (c) c.checked = (ex.id === cfg.exId); }); } catch (e) {}
  if (typeof updateAllRefs === 'function') updateAllRefs();
  // Vider les champs de cet examen avant de réinjecter la ligne.
  cfg.cols.forEach(c => setV(c.dom, ''));
  if (cfg.before) { try { cfg.before(); } catch (e) {} }
  cfg.cols.forEach(c => {
    const src = document.getElementById('g_' + dossId + '_' + c.k);
    const val = src ? String(src.value).trim() : '';
    if (val === '') return;
    const el = document.getElementById(c.dom);
    if (el) { el.value = val; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} }
  });
  if (cfg.type === 'Hématologie') { if (typeof calcConstantes === 'function') calcConstantes(); if (typeof calcFLAbsolues === 'function') calcFLAbsolues(); }
  if (typeof ensureInterpFresh === 'function') ensureInterpFresh(cfg.type);
  return collectResults(cfg.type);
}

async function grilleSaveAll() {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  const cfg = GRILLE_EXAMS[_grilleKey]; if (!cfg) return;
  const rows = [...document.querySelectorAll('#grille-serie tr[data-doss]')]
    .map(tr => tr.dataset.doss).filter(id => grilleRowHasAny(id));
  if (!rows.length) { toast('Aucune ligne remplie', 'err'); return; }
  const incompletes = rows.filter(id => !grilleRowComplete(id)).length;
  if (incompletes && typeof showConfirmModal === 'function') {
    const ok = await showConfirmModal({
      icon: '⚠️', title: 'Lignes incomplètes',
      message: incompletes + ' ligne(s) commencée(s) mais non complète(s) seront enregistrées telles quelles. Continuer ?',
      confirmText: 'Enregistrer', cancelText: 'Annuler'
    });
    if (!ok) return;
  }

  const backup = (typeof benchSnapshot === 'function') ? benchSnapshot() : null;
  showLoading('Enregistrement du lot…');
  let ok = 0, err = 0;
  const btn = document.getElementById('grille-save'); if (btn) btn.disabled = true;
  try {
    for (const dossId of rows) {
      const record = getDB().find(x => String(x.id) === String(dossId));
      if (!record) { err++; continue; }
      try {
        await ensureFull(record);
        const res = grilleBuildResults(cfg, dossId, record.patient?.sexe, record.patient?.age);
        const type = cfg.type;
        const base = record.resultats || {};
        const newRes = { ...base, [type]: res };
        newRes._types = base._types ? [...new Set([...base._types, type])] : [type];
        newRes._facture_seule = false;
        const saved = await updateRecordRemote(record.id, {
          patient: record.patient, type: 'Dossier', resultats: newRes,
          montant: record.montant || 0, prescripteur_id: record.prescripteur_id || null,
        }, { onlyResultats: true });
        if (saved) ok++; else err++;
      } catch (e) { err++; }
    }
  } finally { if (btn) btn.disabled = false; }

  // Restaurer le formulaire (sans changer de vue).
  if (backup) {
    try {
      Object.keys(backup.ident || {}).forEach(id => { const el = document.getElementById(id); if (el) el.value = backup.ident[id]; });
      getCatalogueComplet().forEach(ex => { const c = document.getElementById(ex.id); const s = backup.coches[ex.id]; if (c && s) c.checked = !!s.c; });
      if (typeof calcFicheTotal === 'function') calcFicheTotal();
    } catch (e) {}
  }

  hideLoading();
  await refreshDB(true);
  toast('✅ ' + ok + ' ' + cfg.label + ' enregistrée' + (ok > 1 ? 's' : '') + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
  grilleRender();
}

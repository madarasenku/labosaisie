// ============================================================
//  GRILLE PAILLASSE PAR EXAMEN — saisie en série (v13.119)
//
//  Une ligne par patient, une colonne par paramètre, pour un même
//  examen (Phase 2 : NFS / Hématologie, l'examen le plus demandé).
//  On remplit la grille au fur et à mesure que la machine sort les
//  résultats, puis on enregistre tout le lot d'un coup.
//
//  Correction garantie : chaque ligne est « rejouée » dans le vrai
//  formulaire de saisie (mêmes handlers : indices VGM/TCMH/CCMH,
//  valeurs absolues de la formule leucocytaire, interprétations),
//  puis collectResults('Hématologie') produit EXACTEMENT le même JSON
//  qu'une saisie normale. La grille n'est qu'une surface de saisie.
// ============================================================

// Colonnes saisissables (les indices VGM/TCMH/CCMH sont auto-calculés).
const GRILLE_NFS_COLS = [
  { id: 'gbc',  lab: 'GB' },
  { id: 'gr',   lab: 'GR' },
  { id: 'hb',   lab: 'Hb' },
  { id: 'ht',   lab: 'Ht' },
  { id: 'plt',  lab: 'Plq' },
  { id: 'pnn',  lab: 'PNN %' },
  { id: 'pne',  lab: 'PNE %' },
  { id: 'pnb',  lab: 'PNB %' },
  { id: 'lymp', lab: 'Lymph %' },
  { id: 'mono', lab: 'Mono %' },
];
const GRILLE_NFS_LABEL = 'NFS — Numération Formule Sanguine';

// Dossiers en attente de NFS : facture enregistrée, NFS cochée, résultats
// hématologiques pas encore saisis.
function grillePendingNFS() {
  let db; try { db = getDB(); } catch (e) { db = []; }
  return db.filter(r => {
    if (!isDossierRecord(r) || r.deletedAt || r._hardDeleted) return false;
    const coches = r.resultats?._examens_coches?.['Hématologie'] || [];
    const hasNFS = coches.some(l => /NFS/i.test(l));
    if (!hasNFS) return false;
    const res = r.resultats?.['Hématologie'] || {};
    const dejaRempli = res['Globules blancs (GB)'] && res['Globules blancs (GB)'].valeur;
    return !dejaRempli;   // NFS pas encore remplie
  });
}

// Ouvre la grille de saisie en série NFS.
function ouvrirGrilleNFS() {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  const pend = grillePendingNFS();
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  // Masquer les autres zones de la vue Saisie.
  ['fiche-identification', 'zone-saisie', 'paillasse-bar'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  cont.style.display = '';
  grilleRender(pend);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fermerGrille() {
  const cont = document.getElementById('grille-serie');
  if (cont) cont.style.display = 'none';
  const fiche = document.getElementById('fiche-identification');
  if (fiche) fiche.style.display = '';
  if (typeof benchRenderBar === 'function') benchRenderBar();
}

function grilleRender(pend) {
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  if (!pend.length) {
    cont.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      + '<div style="font-size:15px;font-weight:800;color:var(--cpmi-deep)">📋 Saisie NFS en série</div>'
      + '<button class="btn btn-outline" style="font-size:13px" onclick="fermerGrille()">← Retour</button></div>'
      + '<div style="padding:24px;text-align:center;color:var(--text-muted);background:rgba(255,255,255,.7);border:1px dashed var(--border);border-radius:var(--radius)">'
      + 'Aucun dossier NFS en attente. Enregistrez d\'abord des fiches (facture) avec une NFS cochée.</div>';
    return;
  }
  const head = '<th style="position:sticky;left:0;background:var(--cpmi-deep);color:#fff;text-align:left;padding:8px 10px;min-width:170px;z-index:2">Patient</th>'
    + GRILLE_NFS_COLS.map(c => '<th style="background:var(--cpmi-deep);color:#fff;padding:8px 6px;min-width:66px;font-size:11.5px">' + c.lab + '</th>').join('');
  const rows = pend.map(r => {
    const nom = esc(r.patient?.nom || '—');
    const doss = esc(r.patient?.dossier || '');
    const sexe = esc(r.patient?.sexe || '');
    const cells = GRILLE_NFS_COLS.map(c =>
      '<td style="padding:3px 4px"><input type="number" step="any" inputmode="decimal" '
      + 'id="g_' + r.id + '_' + c.id + '" data-doss="' + r.id + '" data-col="' + c.id + '" '
      + 'oninput="grilleCellChange(' + r.id + ')" '
      + 'style="width:60px;padding:5px 4px;border:1px solid var(--border);border-radius:6px;font-size:12.5px;text-align:center"></td>'
    ).join('');
    return '<tr id="grow_' + r.id + '" data-doss="' + r.id + '">'
      + '<td style="position:sticky;left:0;background:#fff;padding:6px 10px;font-weight:600;font-size:12.5px;border-right:1px solid var(--border)">'
      + '<span id="gtick_' + r.id + '" style="color:#15803d;font-weight:800;margin-right:4px;visibility:hidden">✓</span>'
      + nom + '<div style="font-size:10.5px;color:var(--text-muted);font-weight:500">N° ' + doss + (sexe ? ' · ' + sexe : '') + '</div></td>'
      + cells + '</tr>';
  }).join('');

  cont.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">'
    + '<div style="font-size:15px;font-weight:800;color:var(--cpmi-deep)">📋 Saisie NFS en série — <span style="font-weight:600;color:var(--text-muted);font-size:13px">' + pend.length + ' dossier' + (pend.length > 1 ? 's' : '') + ' en attente</span></div>'
    + '<div style="display:flex;gap:8px"><button class="btn btn-outline" style="font-size:13px" onclick="fermerGrille()">← Retour</button>'
    + '<button id="grille-save" class="btn btn-primary" style="font-size:14px;padding:9px 20px" onclick="grilleSaveAll()">💾 Enregistrer le lot</button></div></div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">VGM · TCMH · CCMH et valeurs absolues sont calculés automatiquement. Laissez une ligne vide pour ne pas l\'enregistrer.</div>'
    + '<div id="grille-hint" style="font-size:12px;color:var(--text-muted);margin-bottom:8px"></div>'
    + '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)"><table style="border-collapse:collapse;width:100%;font-size:12.5px"><thead><tr>'
    + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  grilleUpdateHint();
}

// Une ligne est « prête » si les champs de base (GB, GR, Hb, Ht, Plq + FL) sont
// remplis. Marque la coche verte et met à jour le compteur.
const GRILLE_REQ = ['gbc', 'gr', 'hb', 'ht', 'plt', 'pnn', 'pne', 'pnb', 'lymp', 'mono'];
function grilleRowComplete(dossId) {
  return GRILLE_REQ.every(cid => {
    const el = document.getElementById('g_' + dossId + '_' + cid);
    return el && String(el.value).trim() !== '';
  });
}
function grilleRowHasAny(dossId) {
  return GRILLE_NFS_COLS.some(c => {
    const el = document.getElementById('g_' + dossId + '_' + c.id);
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
  hint.textContent = '✅ ' + prets + ' ligne' + (prets > 1 ? 's' : '') + ' complète' + (prets > 1 ? 's' : '')
    + ' · ' + amorces + ' commencée' + (amorces > 1 ? 's' : '') + ' sur ' + rows.length;
}

// ── Rejoue une ligne dans le vrai formulaire et renvoie le JSON NFS ──
function grilleBuildResults(dossId, sexe, age) {
  if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt('hema');
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  setV('p_sexe', sexe || ''); setV('p_age', age == null ? '' : age);
  // Ne cocher que la NFS pour que collectResults n'emporte pas CRP/Widal/GS.
  try { getCatalogueComplet().forEach(ex => { const c = document.getElementById(ex.id); if (c) c.checked = (ex.id === 'ex_nfs'); }); } catch (e) {}
  // Vider les champs hématologiques avant de réinjecter la ligne.
  ['gbc','gr','hb','ht','vgm','tcmh','ccmh','plt','ret','pnn','pne','pnb','lymp','mono'].forEach(id => setV('v_' + id, ''));
  if (typeof updateAllRefs === 'function') updateAllRefs();
  // GB d'abord (les valeurs absolues de la FL en dépendent).
  const ordre = ['gbc', 'gr', 'hb', 'ht', 'plt', 'pnn', 'pne', 'pnb', 'lymp', 'mono'];
  ordre.forEach(cid => {
    const src = document.getElementById('g_' + dossId + '_' + cid);
    const val = src ? String(src.value).trim() : '';
    if (val === '') return;
    const el = document.getElementById('v_' + cid);
    if (el) { el.value = val; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} }
  });
  if (typeof calcConstantes === 'function') calcConstantes();
  if (typeof calcFLAbsolues === 'function') calcFLAbsolues();
  if (typeof ensureInterpFresh === 'function') ensureInterpFresh('Hématologie');
  return collectResults('Hématologie');
}

async function grilleSaveAll() {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  const rows = [...document.querySelectorAll('#grille-serie tr[data-doss]')]
    .map(tr => tr.dataset.doss)
    .filter(id => grilleRowHasAny(id));
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

  // Sauvegarder l'état du formulaire pour le restaurer après le rejeu.
  const backup = (typeof benchSnapshot === 'function') ? benchSnapshot() : null;

  showLoading('Enregistrement du lot…');
  let ok = 0, err = 0;
  const btn = document.getElementById('grille-save'); if (btn) btn.disabled = true;
  try {
    for (const dossId of rows) {
      const idNum = isNaN(Number(dossId)) ? dossId : Number(dossId);
      const record = getDB().find(x => String(x.id) === String(dossId));
      if (!record) { err++; continue; }
      try {
        await ensureFull(record);
        const res = grilleBuildResults(dossId, record.patient?.sexe, record.patient?.age);
        const type = 'Hématologie';
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
  } finally {
    if (btn) btn.disabled = false;
  }

  // Restaurer le formulaire (sans changer de vue).
  if (backup) {
    try {
      Object.keys(backup.ident || {}).forEach(id => { const el = document.getElementById(id); if (el) el.value = backup.ident[id]; });
      getCatalogueComplet().forEach(ex => {
        const c = document.getElementById(ex.id); const s = backup.coches[ex.id];
        if (c && s) c.checked = !!s.c;
      });
      if (typeof calcFicheTotal === 'function') calcFicheTotal();
    } catch (e) {}
  }

  hideLoading();
  await refreshDB(true);
  toast('✅ ' + ok + ' NFS enregistrée' + (ok > 1 ? 's' : '') + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
  // Recharger la grille avec les dossiers restants.
  grilleRender(grillePendingNFS());
}

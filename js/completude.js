// ============================================================
//  COMPLÉTUDE DE LA SAISIE (v13.141)
//
//  Pendant la saisie « tout sur une page », indique combien de
//  résultats attendus sont remplis et affiche le bouton
//  « Enregistrer + Imprimer » quand tout est complet.
//
//  ⚠ La PAILLASSE (plusieurs dossiers ouverts en parallèle) a été
//  SUPPRIMÉE : elle partageait le formulaire caché avec la saisie en
//  série, couplage à l'origine des pertes de valeurs. Seule la
//  logique de complétude — qui n'a rien de spécifique à la
//  paillasse — est conservée ici.
// ============================================================

// Champs NON requis pour juger qu'un examen est « complet » :
// observations, commentaires, valeurs secondaires ou auto-calculées.
const _OPT_RX = /(_obs$|obs$|comment|profil|_cin_)/i;
const _OPT_IDS = new Set([
  'ge_tdr', 'ge_espece', 'ge_para', 'ge_densite', 'ge_stade',
  'para_tdr', 'para_espece', 'para_densite', 'para_stade', 'para_type',
  'para_coloration', 'para_indice', 'para_parasitemie',
  'gs_obs',
  'v_vgm', 'v_tcmh', 'v_ccmh', 'v_ret', 'ret',   // indices auto-calculés
  'v_ldl', 'v_dfg',                              // valeurs calculées
]);
function _champOptionnel(id) { return _OPT_RX.test(id) || _OPT_IDS.has(id); }

// Complétude d'un examen à partir d'un lecteur de valeur getVal(id) -> string.
function _examCompletion(ex, getVal) {
  let fids; try { fids = examFieldIds(ex.id); } catch (e) { fids = []; }
  if (!fids.length) return { req: 0, ok: 0 };          // bactério, RAI… non mesurable ici
  const rempli = id => { const v = getVal(id); return v != null && String(v).trim() !== ''; };
  // Sérologie : chaque test est satisfait par sr_ (qualitatif) OU sv_ (quantitatif).
  const seroTests = [...new Set(fids.filter(f => f.startsWith('sr_')).map(f => f.slice(3)))];
  if (seroTests.length) {
    let req = 0, ok = 0;
    seroTests.forEach(id => { req++; if (rempli('sr_' + id) || rempli('sv_' + id)) ok++; });
    return { req, ok };
  }
  const req = fids.filter(f => !_champOptionnel(f));
  let ok = 0; req.forEach(f => { if (rempli(f)) ok++; });
  return { req: req.length, ok };
}

// Complétude globale à partir d'un « examen coché ? » et d'un lecteur de valeur.
function _completion(getChecked, getVal) {
  let req = 0, ok = 0, examsTotal = 0, examsDone = 0;
  try {
    getCatalogueComplet().forEach(ex => {
      if (!getChecked(ex.id)) return;
      const c = _examCompletion(ex, getVal);
      req += c.req; ok += c.ok;
      if (c.req > 0) { examsTotal++; if (c.ok >= c.req) examsDone++; }
    });
  } catch (e) {}
  return { req, ok, complete: req > 0 && ok >= req, examsTotal, examsDone };
}

// Complétude du dossier en cours de saisie (lecture directe du formulaire).
function _completionActive() {
  return _completion(
    id => document.getElementById(id)?.checked,
    id => { const el = document.getElementById(id); return el ? el.value : null; }
  );
}

// Bannière « prêt » + bouton « Enregistrer + Imprimer » sous les résultats.
function benchRenderReadyBanner(comp) {
  const bar = document.getElementById('save-all-bar');
  const hint = document.getElementById('save-all-hint');
  if (!bar || !hint) return;
  let printBtn = document.getElementById('btn-save-print');
  if (!printBtn) {
    printBtn = document.createElement('button');
    printBtn.id = 'btn-save-print';
    printBtn.className = 'btn';
    printBtn.style.cssText = 'padding:10px 20px;font-size:14px;gap:8px;margin-right:8px;background:#15803d;color:#fff;display:none';
    printBtn.innerHTML = '🖨️ Enregistrer + Imprimer';
    printBtn.onclick = benchSaveAndPrint;
    const saveBtn = document.getElementById('btn-save-all');
    if (saveBtn && saveBtn.parentNode) saveBtn.parentNode.insertBefore(printBtn, saveBtn);
  }
  if (comp && comp.complete) {
    hint.innerHTML = '✅ <strong>Tout est rempli</strong> — prêt à enregistrer et imprimer';
    hint.style.color = '#15803d';
    hint.style.fontWeight = '700';
    printBtn.style.display = 'inline-flex';
  } else {
    const ex = comp && comp.examsTotal
      ? ' · ' + comp.examsDone + '/' + comp.examsTotal + ' examen' + (comp.examsTotal > 1 ? 's' : '') + ' complet' + (comp.examsDone > 1 ? 's' : '')
      : '';
    hint.textContent = '🖊️ ' + (comp ? comp.ok : 0) + '/' + (comp ? comp.req : 0) + ' résultats remplis' + ex;
    hint.style.color = '';
    hint.style.fontWeight = '';
    printBtn.style.display = 'none';
  }
}

// Recalcule le statut du dossier en cours (bannière). Appelé à la frappe.
function benchUpdateActiveStatus() {
  if (!document.body.classList.contains('fill-all-mode')) return;
  benchRenderReadyBanner(_completionActive());
}

// Enregistrer PUIS imprimer le dossier qui vient d'être saisi.
function benchSaveAndPrint() {
  window._printAfterSave = true;
  if (typeof saveAllTabs === 'function') saveAllTabs();
}

// ── Compat : anciens points d'appel de la paillasse, neutralisés ──
function benchEnabled() { return false; }
function benchRenderBar() {}
function benchCommitOnDemarrer() {}
function benchReset() {}
function benchAfterSave() { return false; }
function benchSnapshot() { return { ident: {}, coches: {}, values: {}, montant: {} }; }
async function benchOpenRecord(id) {
  if (typeof fillAllResults === 'function') return fillAllResults(id);
  if (typeof editRecord === 'function') return editRecord(id);
}

// Mise à jour du statut à chaque saisie dans la zone de résultats.
['input', 'change'].forEach(evt => {
  document.addEventListener(evt, function (ev) {
    const t = ev.target;
    if (!t || !t.closest || !t.closest('#zone-saisie')) return;
    clearTimeout(window._benchStatusT);
    window._benchStatusT = setTimeout(benchUpdateActiveStatus, 120);
  }, true);
});

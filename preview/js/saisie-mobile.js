/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — saisie-mobile.js

   Confort de saisie sur téléphone (surtout iPhone), pour les champs de
   VALEURS de résultats (ceux en `inputmode="decimal"`) :

   1) VIRGULE → POINT. Le clavier français d'iOS propose une virgule ;
      `type="number"` la refusait et la valeur ne rentrait pas. Les champs
      de valeurs sont désormais en `type="text" inputmode="decimal"` (clavier
      numérique, virgule permise) et on remplace « , » par « . » à la volée,
      pour que tout le reste (interprétation, calculs, enregistrement)
      continue de lire un nombre à point.

   2) SIGNES < > ≤ ≥. Certains résultats s'écrivent « < 6 », « > 1000 »… mais
      le pavé numérique n'a pas ces touches. Une petite barre apparaît au-dessus
      du clavier quand on est dans un champ de valeur (sur écran tactile
      seulement) et insère le signe au curseur.

   Chargé en script classique, après session-pwa.js.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── 1) Virgule → point (tous appareils, inoffensif sur desktop) ──────────
  //   Écoute déléguée en phase de CAPTURE : on normalise AVANT que le
  //   gestionnaire du champ (oninput=onParamInput…) ne lise la valeur.
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (el.getAttribute('inputmode') !== 'decimal') return;
    if (el.value.indexOf(',') === -1) return;
    var pos = el.selectionStart;
    el.value = el.value.replace(/,/g, '.');
    try { el.setSelectionRange(pos, pos); } catch (_) {}
  }, true);

  // ── 2) Barre de signes < > ≤ ≥ — écrans tactiles uniquement ──────────────
  var tactile = false;
  try {
    tactile = ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (_) { tactile = false; }
  if (!tactile) return;

  var SIGNES = ['<', '>', '≤', '≥'];
  var bar = null, actif = null, hideTimer = null;

  function construireBarre() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'num-signs-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Insérer un signe');
    bar.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'top:auto', 'bottom:0', 'z-index:4000',
      'display:none', 'gap:6px', 'padding:6px 8px',
      'background:#0b2545', 'box-shadow:0 3px 14px rgba(0,0,0,.32)',
      'justify-content:center', 'align-items:center'
    ].join(';');
    var html = SIGNES.map(function (s) {
      return '<button type="button" data-ins="' + s + '" '
        + 'style="min-width:52px;height:40px;font-size:19px;font-weight:800;border:0;'
        + 'border-radius:10px;background:rgba(255,255,255,.14);color:#fff;cursor:pointer">'
        + s + '</button>';
    }).join('');
    html += '<span style="flex:1"></span>'
      + '<button type="button" data-close="1" aria-label="Fermer" '
      + 'style="min-width:44px;height:40px;font-size:16px;border:0;border-radius:10px;'
      + 'background:rgba(255,255,255,.10);color:#cbd5e1;cursor:pointer">✕</button>';
    bar.innerHTML = html;
    // mousedown (et non click) + preventDefault : garde le focus et le clavier.
    bar.addEventListener('mousedown', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      e.preventDefault();
      if (b.getAttribute('data-close')) { cacher(); return; }
      var ins = b.getAttribute('data-ins');
      if (ins != null && actif) inserer(actif, ins);
    });
    document.body.appendChild(bar);
    return bar;
  }

  // ✅ v13.197 — La barre s'ancre JUSTE AU-DESSUS du champ en cours de saisie
  //   (et non au bas de l'écran, où le clavier iOS la masquait). iOS garde le
  //   champ focalisé visible au-dessus du clavier : une barre collée au champ est
  //   donc toujours à l'écran. Repli au-dessous du champ s'il n'y a pas la place,
  //   ou en bas d'écran si le champ n'a pas de position mesurable.
  function positionner() {
    if (!bar || !actif) return;
    var h = bar.offsetHeight || 48;
    var r = null;
    try { r = actif.getBoundingClientRect(); } catch (_) { r = null; }
    if (r && r.height) {
      var vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      var top = r.top - h - 6;                 // au-dessus du champ
      if (top < 6) top = r.bottom + 6;         // pas de place → juste au-dessous
      if (top + h > vh - 6) top = Math.max(6, vh - h - 6);
      bar.style.bottom = 'auto';
      bar.style.top = Math.round(top) + 'px';
    } else {
      bar.style.top = 'auto';
      bar.style.bottom = '0px';
    }
  }

  function afficher(el) {
    construireBarre();
    actif = el;
    bar.style.display = 'flex';
    positionner();
    // Le clavier iOS s'ouvre et fait défiler le champ APRÈS le focus : on
    // repositionne quelques fois pendant l'animation pour rester collé au champ.
    setTimeout(positionner, 60);
    setTimeout(positionner, 250);
    setTimeout(positionner, 500);
  }
  function cacher() {
    if (bar) bar.style.display = 'none';
    actif = null;
  }

  function inserer(el, txt) {
    var s = (el.selectionStart != null) ? el.selectionStart : el.value.length;
    var en = (el.selectionEnd != null) ? el.selectionEnd : el.value.length;
    el.value = el.value.slice(0, s) + txt + el.value.slice(en);
    var p = s + txt.length;
    try { el.setSelectionRange(p, p); } catch (_) {}
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }

  function estChampValeur(el) {
    return el && el.tagName === 'INPUT' && el.getAttribute('inputmode') === 'decimal';
  }

  document.addEventListener('focusin', function (e) {
    if (estChampValeur(e.target)) { clearTimeout(hideTimer); afficher(e.target); }
  });
  document.addEventListener('focusout', function (e) {
    if (!estChampValeur(e.target)) return;
    // Laisse le temps au tap sur un bouton de la barre.
    hideTimer = setTimeout(function () {
      var a = document.activeElement;
      if (!estChampValeur(a)) cacher();
    }, 200);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { if (actif) positionner(); });
    window.visualViewport.addEventListener('scroll', function () { if (actif) positionner(); });
  }
  // La barre est ancrée au champ : suivre aussi le défilement de la page.
  window.addEventListener('scroll', function () { if (actif) positionner(); }, true);
})();

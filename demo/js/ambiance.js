// ════════════════════════════════════════════════════════════════════
//  Ambiance animée
//    • Bandeau d'accueil : salutation, écran ouvert, poste en cours
//      (permanence / garde du X au Y) et horloge.
//    • Entrée animée des cartes à chaque changement d'écran.
//    • « Pop » des chiffres des cartes résumé quand ils changent.
//  Purement visuel : aucun calcul ni aucun enregistrement n'en dépend.
// ════════════════════════════════════════════════════════════════════
(function () {
  const VUES = {
    accueil:    ['Accueil', 'Vue d’ensemble du laboratoire'],
    saisie:     ['Nouvelle saisie', 'Identifiez le patient, cochez les examens, enregistrez la fiche.'],
    historique: ['Historique', 'Dossiers, encaissements et résultats de la journée de service.'],
    stats:      ['Statistiques', 'Activité et recettes sur la période choisie.'],
    comptes:    ['Comptes', 'Utilisateurs, tarifs et réglages.'],
    caisse:     ['Caisse', 'Encaissements et clôture de la journée.'],
    cahier:     ['Cahier', 'Écritures de caisse du mois.'],
  };
  const SOLEIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const LUNE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  let vue = 'saisie';

  const $ = id => document.getElementById(id);
  const moisCourt = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const jourNum = d => new Date(d + 'T12:00:00').getDate();

  function majHero() {
    const hero = $('pp-hero');
    if (!hero) return;
    hero.hidden = (vue === 'accueil');
    const now = new Date();
    const h = now.getHours();
    const nom = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.username) || '';
    $('pp-hero-hello').textContent = (h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir') + (nom ? ', ' + nom : '');
    const t = VUES[vue] || VUES.saisie;
    $('pp-hero-titre').textContent = t[0];
    const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('pp-hero-sub').textContent = date.charAt(0).toUpperCase() + date.slice(1) + ' · ' + t[1];
    // Poste en cours : permanence 8h–16h30, sinon garde (une garde = une journée).
    let garde = false, libelle = 'Permanence · 8 h – 16 h 30';
    try {
      garde = typeof posteDepuisHeure === 'function' && posteDepuisHeure(now.toISOString()) === 'Garde';
      if (garde && typeof _jourServiceCourant === 'function' && typeof _jourPlus === 'function') {
        const j = _jourServiceCourant(), f = _jourPlus(j, 1);
        libelle = 'Garde du ' + jourNum(j) + ' au ' + moisCourt(f);
      } else if (garde) libelle = 'Garde';
    } catch (e) {}
    $('pp-hero-poste-txt').textContent = libelle;
    $('pp-hero-ic').innerHTML = garde ? LUNE : SOLEIL;
    hero.classList.toggle('est-garde', garde);
    const hh = String(h).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    $('pp-hero-clock').innerHTML = hh + '<i>:</i>' + mm;
  }

  // Entrée animée des cartes de l'écran affiché.
  function animerVue(v) {
    const el = $('view-' + v) || (v === 'caisse' ? ($('view-caisse') || $('view-caisse-user')) : null);
    const main = document.querySelector('#app-root > main') || document.querySelector('main');
    [el, main].forEach(x => {
      if (!x) return;
      x.classList.remove('pp-anim-in'); void x.offsetWidth; x.classList.add('pp-anim-in');
      clearTimeout(x._ppT); x._ppT = setTimeout(() => x.classList.remove('pp-anim-in'), 1400);
    });
  }

  // Les chiffres des cartes résumé « sautent » quand ils changent.
  function brancherPop() {
    if (typeof window.majCartesResume !== 'function' || window.majCartesResume._pp) return;
    const orig = window.majCartesResume;
    const ids = ['hist-res-jour', 'hist-res-paye', 'hist-res-impaye', 'hist-res-attendus'];
    const f = function () {
      const avant = ids.map(i => ($(i) || {}).textContent);
      const r = orig.apply(this, arguments);
      ids.forEach((i, k) => {
        const e = $(i);
        if (!e || e.textContent === avant[k]) return;
        e.classList.remove('kpi-pop'); void e.offsetWidth; e.classList.add('kpi-pop');
      });
      return r;
    };
    f._pp = true;
    window.majCartesResume = f;
  }

  function brancherVues() {
    if (typeof window.showView !== 'function' || window.showView._pp) return;
    const orig = window.showView;
    const f = function (v) {
      const r = orig.apply(this, arguments);
      vue = v;
      try { majHero(); animerVue(v); } catch (e) {}
      return r;
    };
    f._pp = true;
    window.showView = f;
  }

  function demarrer() {
    brancherVues();
    brancherPop();
    const actif = document.querySelector('header .nav-btn.active[data-view]');
    if (actif) vue = actif.dataset.view;
    try { majHero(); } catch (e) {}
    setInterval(() => { try { majHero(); } catch (e) {} }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

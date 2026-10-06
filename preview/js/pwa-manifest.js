/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — pwa-manifest.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

(function() {
  const canvas = document.getElementById('cpmi-bg-canvas');
  if (!canvas) return;
  // Respect de prefers-reduced-motion : pas d'animation de fond
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { canvas.remove(); return; }
  const ctx = canvas.getContext('2d');

  // Symboles médicaux épurés — palette clinique
  const SYMBOLS = ['✚','◌','✦','⊕','◎'];
  const COLORS  = [
    'rgba(11,37,69,',    // navy institutionnel
    'rgba(0,150,199,',   // bleu médical
    'rgba(0,180,216,',   // teal accent
    'rgba(122,176,204,', // bleu doux
  ];

  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticle() {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return {
      x:    Math.random() * W,
      y:    H + 30,
      size: 10 + Math.random() * 28,
      speed: .25 + Math.random() * .55,
      opacity: .07 + Math.random() * .15,
      symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      color,
      drift: (Math.random() - .5) * .4,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - .5) * .01,
    };
  }

  function init() {
    resize();
    // Pré-peupler pour ne pas avoir d'écran vide
    for (let i = 0; i < 25; i++) {
      const p = createParticle();
      p.y = Math.random() * H;
      particles.push(p);
    }
  }

  let _animPaused = false;
  document.addEventListener('visibilitychange', () => {
    _animPaused = document.hidden;
    if (!_animPaused) animate(); // reprendre si l'onglet redevient visible
  });

  function animate() {
    if (_animPaused) return; // ✅ v2: pause animation onglet inactif (économie CPU)
    ctx.clearRect(0, 0, W, H);
    // Ajouter de nouvelles particules
    if (particles.length < 35 && Math.random() < .025) {
      particles.push(createParticle());
    }
    particles.forEach((p, i) => {
      p.y       -= p.speed;
      p.x       += p.drift;
      p.rotation += p.rotSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color + p.opacity + ')';
      ctx.fillText(p.symbol, 0, 0);
      ctx.restore();

      // Supprimer les particules sorties de l'écran
      if (p.y < -50) particles.splice(i, 1);
    });
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  init();
  animate();
})();


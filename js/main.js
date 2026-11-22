document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-header .nav');
  menuButton?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.textContent = open ? '×' : '☰';
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
    if (menuButton) menuButton.textContent = '☰';
  }));

  // A loja trabalha com um único produto: Cronus Zen.
  document.querySelectorAll('[data-product]').forEach(link => {
    link.addEventListener('click', () => {
      try {
        localStorage.setItem('kronix_cart', JSON.stringify([{ id: 'cronus-zen', name: 'Cronus Zen', price: 102990, quantity: 1 }]));
      } catch (_) {}
    });
  });
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  const count = document.getElementById('cart-count');
  if (count) {
    try {
      const cart = JSON.parse(localStorage.getItem('kronix_cart') || '[]');
      count.textContent = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : 0;
    } catch (_) { count.textContent = '0'; }
  }

  const gameSection = document.querySelector('.game-section');
  if (gameSection && 'IntersectionObserver' in window) {
    gameSection.classList.add('game-reveal-ready');
    const observer = new IntersectionObserver((entries, obs) => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('game-visible'); obs.unobserve(entry.target); }
    }), { threshold: 0.15 });
    observer.observe(gameSection);
  }
  console.log(gameSection);
});

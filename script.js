const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });

  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));
}

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

/* Home hero slider + reference-style arrows/dots */
const heroSlides = Array.from(document.querySelectorAll('.hero-slide'));
const heroDots = Array.from(document.querySelectorAll('.hero-dot'));
const heroPrev = document.querySelector('.hero-prev');
const heroNext = document.querySelector('.hero-next');
let currentHeroSlide = Math.max(0, heroSlides.findIndex(slide => slide.classList.contains('active')));

const showHeroSlide = (index) => {
  if (!heroSlides.length) return;

  heroSlides.forEach((slide, i) => slide.classList.toggle('active', i === index));
  heroDots.forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
    dot.setAttribute('aria-current', i === index ? 'true' : 'false');
  });
  currentHeroSlide = index;
};

if (heroSlides.length > 1) {
  heroPrev?.addEventListener('click', () => {
    showHeroSlide((currentHeroSlide - 1 + heroSlides.length) % heroSlides.length);
  });

  heroNext?.addEventListener('click', () => {
    showHeroSlide((currentHeroSlide + 1) % heroSlides.length);
  });

  heroDots.forEach((dot, index) => {
    dot.addEventListener('click', () => showHeroSlide(index));
  });

  setInterval(() => {
    showHeroSlide((currentHeroSlide + 1) % heroSlides.length);
  }, 6000);
}

/* Scroll reveal */
const revealItems = document.querySelectorAll(
  '.category-card,.portfolio-card,.video-card,.service-list > div,blockquote,.about-copy,.about-image,.gallery-item'
);

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  revealItems.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
    observer.observe(el);
  });
}

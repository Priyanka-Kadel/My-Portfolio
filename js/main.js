/* =========================================================
   Home page: single scrolling page (Home → Work → About),
   typewriter headline, nav that follows the scroll, and the
   scroll-linked journey timeline. The 3D lanyard lives in lanyard.js.
   Your LinkedIn / email / resume links live in config.js.
   ========================================================= */
import { $, $$, reduceMotion, initLinks, initNav } from './chrome.js';

/* ---- Card content (drawn onto the 3D pass) ---- */
const CARD = {
  name: 'Priyanka Kadel',
  portrait: 'assets/me-bw.webp',
  title: ['UI/UX Designer'],
  city: 'KATHMANDU, NEPAL',
  backHeader: ['PORTFOLIO / 2026', 'NO. 001'],
  backRole: 'Associate UI/UX Designer',
  backSkills: ['User Research', 'Interaction Design', 'Wireframing & Prototyping'],
  backEdu: ['BSC (HONS) COMPUTING', 'COVENTRY UNIVERSITY'],
};

const WORDS = ['understand', 'navigate', 'use'];

initLinks();

// Polaroid placeholder until a photo is added
(() => {
  const photo = $('.pola-photo');
  const miss = () => photo.classList.add('missing');
  photo.addEventListener('error', miss);
  if (photo.complete && !photo.naturalWidth) miss();
})();

/* ---------- Typewriter headline ---------- */
(() => {
  const el = $('#rot'), caret = $('#caret');
  if (reduceMotion) return;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    let i = 0;
    await wait(1800);
    for (;;) {
      const w = WORDS[i];
      caret.classList.remove('idle');
      for (let n = w.length - 1; n >= 0; n--) { el.textContent = w.slice(0, n); await wait(55); }
      caret.classList.add('idle');
      await wait(450);
      i = (i + 1) % WORDS.length;
      const next = WORDS[i];
      caret.classList.remove('idle');
      for (let n = 1; n <= next.length; n++) { el.textContent = next.slice(0, n); await wait(95 + Math.random() * 40); }
      caret.classList.add('idle');
      await wait(1800);
    }
  })();
})();

/* ---------- One scrolling page: nav follows the section in view ---------- */
const nav = initNav('home');
const sections = { home: $('#home'), work: $('#work'), about: $('#about') };

function spy() {
  const probe = innerHeight * 0.45;
  let id = 'home';
  for (const [k, el] of Object.entries(sections)) if (el.getBoundingClientRect().top <= probe) id = k;
  nav.setCurrent(id);
}

// In-page links (#, #work, #about) glide to their section and update the URL
function goTo(id) {
  const el = sections[id];
  const top = id === 'home' || !el ? 0 : el.getBoundingClientRect().top + scrollY;
  try { history.replaceState(null, '', id === 'home' ? location.pathname + location.search : '#' + id); } catch {}
  window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
}
$$('[data-home], a[href^="#"]:not([data-contact]):not(#q-linkedin)').forEach(a => {
  const id = (a.getAttribute('href') || '#').slice(1) || 'home';
  if (!sections[id]) return;
  a.addEventListener('click', e => { e.preventDefault(); goTo(id); });
});

/* ---------- 3D pass: loads right away, only animates while Home is on screen ---------- */
let lanyard = null, heroVisible = true;
import('./lanyard.js')
  .then(m => m.createLanyard($('#stage'), { ...CARD, reduceMotion }))
  .then(l => { lanyard = l; if (heroVisible) l.start(); })
  .catch(err => {
    console.warn('3D pass unavailable:', err);
    $('#hint').hidden = true;
  });
new IntersectionObserver(([entry]) => {
  heroVisible = entry.isIntersecting;
  if (!lanyard) return;
  if (heroVisible) lanyard.start(); else lanyard.stop();
}).observe(sections.home);

/* ---------- Journey timeline: scroll-linked fill + reveal ---------- */
const tl = $('#tl'), fill = $('#tl-fill');
const items = $$('.tl-item', tl);
items.forEach((it, i) => it.classList.add(i % 2 ? 'left' : 'right'));
let ticking = false;

function updateTimeline() {
  ticking = false;
  spy();
  const r = tl.getBoundingClientRect();
  if (reduceMotion) {
    fill.style.height = r.height + 'px';
    items.forEach(it => it.classList.add('on'));
    return;
  }
  const marker = innerHeight * 0.62;
  fill.style.height = Math.max(0, Math.min(r.height, marker - r.top)) + 'px';
  items.forEach(it => {
    const y = it.querySelector('.tl-year').getBoundingClientRect();
    it.classList.toggle('on', y.top + y.height / 2 < marker);
  });
}
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateTimeline); } };
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
updateTimeline();

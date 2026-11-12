/* =========================================================
   Case-study pages: shared chrome, reading-progress bar,
   "On this page" highlighting and gentle section reveals.
   ========================================================= */
import { $, $$, reduceMotion, initLinks, initNav } from './chrome.js';

initLinks();
initNav('work');

const bar = $('#read-bar');
const body = $('.case-body');
const tocLinks = $$('.case-toc a');
const tocTargets = tocLinks.map(a => $(a.getAttribute('href')));

let ticking = false;
function update() {
  ticking = false;
  // progress through the article body
  const r = body.getBoundingClientRect();
  const total = r.height - innerHeight * 0.5;
  const p = Math.max(0, Math.min(1, -r.top / Math.max(1, total)));
  bar.style.transform = `scaleX(${p})`;

  // current section in the table of contents
  const probe = innerHeight * 0.35;
  let active = -1;
  tocTargets.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= probe) active = i; });
  tocLinks.forEach((a, i) => a.classList.toggle('on', i === active));
}
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
update();

// TOC links glide to their section
tocLinks.forEach((a, i) => a.addEventListener('click', e => {
  const el = tocTargets[i];
  if (!el) return;
  e.preventDefault();
  window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 32, behavior: reduceMotion ? 'auto' : 'smooth' });
  try { history.replaceState(null, '', a.getAttribute('href')); } catch {}
}));

// Sections fade up as they enter the viewport
const reveals = $$('.reveal');
if (reduceMotion || !('IntersectionObserver' in window)) reveals.forEach(el => el.classList.add('in'));
else {
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -12% 0px' });
  reveals.forEach(el => io.observe(el));
}

/* =========================================================
   Shared page chrome: toast, quick links (LinkedIn / resume),
   contact buttons and the floating bottom nav pill.
   ========================================================= */
import { LINKEDIN_URL, RESUME_URL, CONTACT_EMAIL } from './config.js';

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Toast ---------- */
let toastT;
export function say(msg) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toast.hidden = true; }, 2400);
}

/* ---------- Quick links + contact ---------- */
export function initLinks() {
  const li = $('#q-linkedin');
  if (li) {
    if (LINKEDIN_URL) li.href = LINKEDIN_URL;
    else {
      li.removeAttribute('target');
      li.addEventListener('click', e => { e.preventDefault(); say('LinkedIn link coming soon'); });
    }
  }

  // Resume: only download if the file actually exists, otherwise explain.
  const cv = $('#q-resume');
  if (cv) {
    cv.href = RESUME_URL;
    let checked = null;
    cv.addEventListener('click', async e => {
      if (checked === true) return;
      e.preventDefault();
      if (checked === null) {
        try { checked = (await fetch(RESUME_URL, { method: 'HEAD' })).ok; } catch { checked = false; }
      }
      if (checked) cv.click();
      else say('Resume coming soon');
    });
  }

  // "Contact me" / "Get in touch": email first, then LinkedIn
  $$('[data-contact]').forEach(contact => {
    if (CONTACT_EMAIL) contact.href = 'mailto:' + CONTACT_EMAIL;
    else if (LINKEDIN_URL) { contact.href = LINKEDIN_URL; contact.target = '_blank'; contact.rel = 'noopener'; }
    else contact.addEventListener('click', e => { e.preventDefault(); say('Contact details coming soon'); });
  });

  // Contact details lines only appear once filled in
  const details = $('.contact-details');
  if (details) {
    const em = $('#contact-email'), ln = $('#contact-linkedin');
    if (CONTACT_EMAIL) { em.hidden = false; const a = $('a', em); a.href = 'mailto:' + CONTACT_EMAIL; a.textContent = CONTACT_EMAIL; }
    if (LINKEDIN_URL) { ln.hidden = false; $('a', ln).href = LINKEDIN_URL; }
    details.hidden = !CONTACT_EMAIL && !LINKEDIN_URL;
  }
}

/* ---------- Bottom nav: pill rests on the current page, slides to hover ---------- */
export function initNav(initial = 'home') {
  const nav = $('#nav');
  const hi = $('.nav-hi', nav);
  const links = $$('a', nav);
  let current = links.find(l => l.dataset.page === initial) || links[0];
  let page = null;

  function moveHi(a, instant) {
    if (instant) hi.style.transition = 'none';
    hi.style.width = a.offsetWidth + 'px';
    hi.style.transform = `translateX(${a.offsetLeft}px)`;
    links.forEach(l => l.classList.toggle('lit', l === a));
    if (instant) { hi.offsetWidth; hi.style.transition = ''; }
  }
  links.forEach(a => {
    a.addEventListener('pointerenter', () => moveHi(a));
    a.addEventListener('focus', () => moveHi(a));
  });
  nav.addEventListener('pointerleave', () => moveHi(current));
  nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) moveHi(current); });
  addEventListener('resize', () => moveHi(current, true));
  document.fonts?.ready.then(() => moveHi(current, true));

  function setCurrent(id, instant) {
    if (id === page) return;
    page = id;
    current = links.find(l => l.dataset.page === id) || links[0];
    links.forEach(l => l.toggleAttribute('aria-current', l === current));
    current.setAttribute('aria-current', 'page');
    if (!nav.matches(':hover') && !nav.contains(document.activeElement)) moveHi(current, instant);
  }
  setCurrent(initial, true);
  moveHi(current, true);
  return { setCurrent };
}

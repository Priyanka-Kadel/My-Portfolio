/* =========================================================
   Routing (Home / Work / About), typewriter headline, sliding nav,
   quick links, and the scroll-linked journey timeline.
   The 3D lanyard lives in lanyard.js and is only loaded on Home.
   ========================================================= */

/* ---- Your links: fill these in ---- */
const LINKEDIN_URL = '';                 // e.g. 'https://www.linkedin.com/in/your-handle/'
const RESUME_URL = 'assets/resume.pdf';  // drop the PDF at this path
const CONTACT_EMAIL = '';                // optional; used by "Contact me" (falls back to LinkedIn)

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

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Toast ---------- */
const toast = $('#toast');
let toastT;
function say(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toast.hidden = true; }, 2400);
}

/* ---------- Quick links ---------- */
(() => {
  const li = $('#q-linkedin');
  if (LINKEDIN_URL) li.href = LINKEDIN_URL;
  else {
    li.removeAttribute('target');
    li.addEventListener('click', e => { e.preventDefault(); say('LinkedIn link coming soon'); });
  }

  // Resume: only download if the file actually exists, otherwise explain.
  const cv = $('#q-resume');
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

  // "Contact me" / "Get in touch": email first, then LinkedIn
  $$('[data-contact]').forEach(contact => {
    if (CONTACT_EMAIL) contact.href = 'mailto:' + CONTACT_EMAIL;
    else if (LINKEDIN_URL) { contact.href = LINKEDIN_URL; contact.target = '_blank'; contact.rel = 'noopener'; }
    else contact.addEventListener('click', e => { e.preventDefault(); say('Contact details coming soon'); });
  });

  // Contact details lines only appear once filled in
  const em = $('#contact-email'), ln = $('#contact-linkedin');
  if (CONTACT_EMAIL) { em.hidden = false; const a = $('a', em); a.href = 'mailto:' + CONTACT_EMAIL; a.textContent = CONTACT_EMAIL; }
  if (LINKEDIN_URL) { ln.hidden = false; $('a', ln).href = LINKEDIN_URL; }
  $('.contact-details').hidden = !CONTACT_EMAIL && !LINKEDIN_URL;

  // Polaroid placeholder until a photo is added
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

/* ---------- Bottom nav: pill rests on the current page, slides to hover ---------- */
const nav = $('#nav');
const hi = $('.nav-hi', nav);
const links = $$('a', nav);
let current = links[0];

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

/* ---------- Router ---------- */
const views = { home: $('#home-view'), work: $('#work-view'), about: $('#about-view') };
let page = null;
let lanyard = null, lanyardLoading = null;

function loadLanyard() {
  if (lanyard || lanyardLoading) return lanyardLoading;
  lanyardLoading = import('./lanyard.js')
    .then(m => m.createLanyard($('#stage'), { ...CARD, reduceMotion }))
    .then(l => { lanyard = l; if (page === 'home') l.start(); return l; })
    .catch(err => {
      console.warn('3D pass unavailable:', err);
      $('#hint').hidden = true;
    });
  return lanyardLoading;
}

function route() {
  const next = (location.hash || '').replace('#', '');
  const target = views[next] ? next : 'home';
  if (target === page) return;
  const first = page === null;
  page = target;

  for (const [k, v] of Object.entries(views)) v.hidden = k !== target;
  document.body.className = 'view-' + target;
  if (!first) window.scrollTo(0, 0);

  current = links.find(l => l.dataset.page === target) || links[0];
  links.forEach(l => l.toggleAttribute('aria-current', l === current));
  current.setAttribute('aria-current', 'page');
  moveHi(current, first);

  if (target === 'home') { if (lanyard) lanyard.start(); else loadLanyard(); }
  else lanyard?.stop();

  if (target === 'about') requestAnimationFrame(updateTimeline);
}

// Logo / "#" links always go home, even when there's no hash change to fire
$$('[data-home], a[href="#"]:not([data-contact]):not(#q-linkedin)').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    try { history.pushState(null, '', location.pathname + location.search); } catch {}
    route();
    window.scrollTo(0, 0);
  });
});
addEventListener('hashchange', route);
addEventListener('popstate', route);

/* ---------- Journey timeline: scroll-linked fill + reveal ---------- */
const tl = $('#tl'), fill = $('#tl-fill');
const items = $$('.tl-item', tl);
items.forEach((it, i) => it.classList.add(i % 2 ? 'left' : 'right'));
let ticking = false;

function updateTimeline() {
  ticking = false;
  if (page !== 'about') return;
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

route();

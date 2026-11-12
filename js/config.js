/* =========================================================
   Your links: fill these in. Shared by every page.
   ========================================================= */
export const LINKEDIN_URL = '';      // e.g. 'https://www.linkedin.com/in/your-handle/'
export const CONTACT_EMAIL = '';     // optional; used by "Contact me" / "Get in touch" (falls back to LinkedIn)

// Resume PDF lives at /assets/resume.pdf (resolved so it works from any page)
export const RESUME_URL = new URL('../assets/resume.pdf', import.meta.url).href;

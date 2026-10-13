# Homepage premium refresh

## Changes

- Why KJM: asymmetric coastal photograph with rounded organic corner, editorial heading and separated benefit rows instead of repeated dark cards. Existing benefit text retained; no ratings, coverage or service guarantees added.
- FAQ preview: compact ivory split composition, smaller heading, transparent disclosure rows, focus/hover treatment and native expansion/collapse transitions. All FAQ questions and answers remain unchanged. Draft status is explicit.
- Motion: 520ms reveal duration, restrained 14px displacement, one-time IntersectionObserver reveal, stagger capped at 180ms; short hero entrance stagger and 8px booking-card entrance. No parallax, continuous animation, scroll-jacking or new library.
- Homepage card interactions: refined transform/shadow transitions, focus-within outline, button hover feedback and small arrow movement; existing imagery, scale effect, prices and public catalog filtering preserved.

## Files changed

- src/app/(website)/page.tsx
- src/components/website/home-sections.tsx
- src/components/website/home-reveal.tsx (new)
- src/components/website/home-motion.module.css (new)
- src/components/website/faq-list.tsx (optional homepage preview variant; other FAQ styling preserved)
- src/components/website/faq-preview.module.css (new)
- docs/homepage-premium-refresh.md (new)
- docs/screenshots/home-refresh/ (new browser evidence)

## Verification

- ESLint passed.
- TypeScript passed.
- Existing automated tests: 41 passed across seven files.
- Production build: Next webpack build passed.
- Actual Microsoft Edge browser at 360, 390, 768, 1024 and 1440px: no horizontal overflow, zero axe WCAG 2 A/AA and 2.1 AA violations at each width.
- Manual review of mobile full-page and desktop Why KJM/FAQ screenshots: readable text, balanced image/text composition and compact FAQ spacing.
- FAQ keyboard Enter opens and closes native details. Browser supports interpolate-size animation. Browsers without support retain fully usable native disclosures without animated height.
- Reduced-motion emulation: hero animation-name is none; scoped rule disables transitions/animations and hover transforms throughout the homepage.
- JavaScript-disabled context: page content, heading sections and native FAQ remain server-rendered. Reveal wrappers are never hidden by default; there is no opacity-zero waiting state. Existing interactive date picker still requires JavaScript, unchanged by this task.
- Screenshots: home-{360,390,768,1024,1440}.png, hero-{390,1440}.png, why-desktop.png and faq-desktop.png in docs/screenshots/home-refresh/.

## Limitations and boundaries

Automated accessibility checks are not certification. Cross-browser animation behavior outside Edge has not been tested; native disclosure fallback is intentional. Existing draft policies remain drafts. Existing licensed Mactan beach photography is reused with attribution, not presented as KJM premises.

No Supabase, migration, authentication, booking-validation, verification, inventory, price or KJM ADMIN changes. No production settings changed, no public booking enabled, no integrations and no deployment.

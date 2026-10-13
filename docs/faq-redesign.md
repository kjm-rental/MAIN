# FAQ design repair — October 11, 2026

Review: http://localhost:3000/faq. KJM MAIN only. No deployment.

## Root causes

The configured *.css Tailwind Turbopack loader turns faq-page.module.css into faq-page.module.css.css, treated as ordinary CSS. The CSS loaded with literal selectors, but imported styles returned no class names. The rendered FAQ had no layout classes: typography, margins and SVG bounds never applied.

Replaced the module with a uniquely prefixed kjm-faq-* stylesheet and explicit matching class names. No global loader configuration or other pages were changed.

The shared website loading boundary also hid the page in a streamed container requiring JavaScript to reveal it. Moved /faq into its own (faq) route group, reusing the exact website layout/header/footer. The URL is unchanged; all five native disclosures now render visibly without JavaScript.

## Design and animation

Compact editorial hero, exact requested introduction, headline 62px at 1440px and 42px on phones. Coastal illustration capped at 290px and hidden on phones. Desktop sidebar contains introduction/category navigation; right column contains rounded ivory accordion cards. Mobile uses wrapping topic pills and a single column. Deep teal contact panel uses the requested copy and existing /contact URL.

All five original answers remain unchanged. Four content-supported categories are used; no dedicated pickup/return answer exists, so no new policy was invented.

Light CSS fade-up/stagger, progressive native height/content-visibility transitions, animated plus/minus and hover transitions. Reduced motion disables animations/transitions. Native Enter/Space disclosure controls, visible focus, 44px filter targets, aria-pressed/aria-controls, status region, and aria-hidden decorative arrows. All content is server-rendered; filters are hidden without JavaScript.

## Files changed

- src/app/(website)/faq/page.tsx moved to src/app/(faq)/faq/page.tsx.
- src/app/(faq)/layout.tsx — reuse site chrome without the streaming loading boundary.
- src/components/website/faq-explorer.tsx — sidebar, filters, accessible decorative arrows.
- src/components/website/faq-page.module.css replaced by src/components/website/faq-page.css.
- docs/faq-redesign.md and docs/screenshots/faq/.

Shared faq-content.ts and homepage faq-list.tsx were unchanged during this repair.

## Verification

TypeScript and ESLint passed. All 43 existing tests across eight files passed. Production build passed with 20 existing homepage home-motion.module.css :global-selector warnings, outside FAQ scope. Local dev /faq returns HTTP 200.

Actual isolated Chromium browser tested the production build at 360, 390, 768, 1024 and 1440px. All five widths: no horizontal overflow; heading at least 40px; correct margins; bounded illustration; filter targets at least 44px; all category filters work; native Enter/Space opening/closing works; visible keyboard focus; reduced motion works; Contact KJM reaches /contact; no page JavaScript errors. Axe WCAG 2 A/AA and 2.1 AA: zero FAQ violations at all five sizes.

First desktop question appears around y=534px at 1024px and y=546px at 1440px in a 900px-tall viewport. JavaScript-disabled Chromium displays all five questions, hides filters, and opens the native disclosure with its answer visible after the CSS transition.

Desktop/mobile/tablet screenshots were visually inspected, including expanded answers. Captures: faq-{360,390,768,1024,1440}.png, faq-{width}-expanded.png, faq-no-javascript.png. verification.json records automated layout/interaction results.

## Remaining issues

No known FAQ failures in tested Chromium. Safari, Firefox and physical devices were not tested. The existing CSS Modules loader problem may affect other module-based pages and remains outside this FAQ-only repair. Business policies remain pending as the original answers state.

No Supabase, migration, price, booking, admin, auth, integration or payment changes. No deployment.

# Phase 7 contrast corrections

Presentation changes only: no migrations, booking calls, prices, Auth settings, or production records changed.

## Semantic colors

| Token          | Hex     | Intended use                                 | Verified contrast                   |
| -------------- | ------- | -------------------------------------------- | ----------------------------------- |
| deep-teal      | #153f40 | Primary text, coral buttons                  | 9.59:1 on sand; 6.19:1 on coral     |
| muted          | #466261 | Secondary text, placeholders, light surfaces | 5.48:1 on sand; 6.33:1 on off-white |
| on-dark-muted  | #e0ece8 | Secondary text on dark surfaces              | 9.54:1 on deep teal                 |
| ocean          | #086d69 | Links, controls, turquoise backgrounds       | White text 6.17:1                   |
| control-border | #6b817e | Input outlines                               | 3.44:1 on sand                      |

Sand #f1e9db, off-white #fcfaf6 and coral #f6ad88 retained. Opaque muted text replaces translucent teal and white utility classes across existing pages. Decorative translucent icons are retained when aria-hidden. Disabled controls retain readable muted text on sand instead of fading their entire element.

Removed the hero selector that incorrectly colored cream booking-card paragraphs white. Scoped hero copy is explicitly light; the location badge is dark on sand. Photo overlays now have a minimum 75% deep-teal opacity. The destination text is positioned at the bottom of its card with a stronger gradient. Image credits sit on dark surfaces. Small coral labels on turquoise surfaces use white instead.

## Coverage

Updated shared typography across homepage, fleet, motorcycle detail, checkout and extras, verification inputs, booking status, tester sign-in, About, contact, FAQ, how-it-works, destination inspiration, legal drafts, footer, not-found and error surfaces. Loading skeleton contains no faded informational text.

Actual Edge/Playwright rendering: 13 routes at 360, 390, 768, 1024 and 1440px. No horizontal overflow. Axe color-contrast checks found and corrected the benefits heading, final CTA label, and destination-card label. Photography and transparent backgrounds also generate manual-review results; these are not automatically certified by axe. Mobile homepage screenshot inspected manually. Protected checkout gate was inspected; authenticated stages and owned status require an authorized tester session and were not exercised. Their shared text and control classes were corrected in source.

Screenshots: /tmp/kjm-contrast-before.png and /tmp/kjm-contrast-after-{360,390,768,1024,1440}.png. Before screenshot is desktop; after screenshots cover all requested widths.

Lint, TypeScript, 29 existing automated tests and webpack production build passed. No claim of complete WCAG certification: browser review is limited to accessible routes, and interactive error/disabled combinations in protected checkout still need tester review.

# Premium About page — October 11, 2026

KJM MAIN only. Review: http://localhost:3000/about. No deployment.

## Sections redesigned

1. Split hero: location label, requested three-line headline, introduction, Explore Motorcycles CTA, authentic Mactan beach photograph with asymmetrically rounded corners.
2. Editorial introduction: island-oriented typography and the existing factual rental/verification information. Identity and driver’s license requirements, manual international eligibility review and restricted online booking remain explicit.
3. Coastal experience: separate Cordova sunset photograph paired with deep teal/coral copy and an Explore Cebu link. No travel-time, road-access or venue-availability promises.
4. Numbered rental journey: browse/compare, dates/extras, documents/KJM approval. Three editorial columns become a vertical numbered sequence on phones; a link opens How It Works.
5. Warm sand finale with the requested heading/supporting text and a coral Explore Motorcycles CTA.

No invented founding year, business history, team, customers, policies or equipment inclusions.

## Implementation and changed files

- src/app/(website)/about/page.tsx moved/replaced by src/app/(about)/about/page.tsx.
- src/app/(about)/layout.tsx reuses the existing website layout/header/footer without its streaming loading boundary, so static About content is visible without JavaScript. URL remains /about.
- src/components/website/about-page.css: uniquely scoped kjm-about-* stylesheet, responsive split layouts, typography, motion and focus. Avoids the known project CSS Module loader issue without touching global CSS/configuration.
- src/components/website/about-reveal.tsx: small IntersectionObserver enhancement. Content is visible by default; motion only applies when entering view. No new animation dependencies.
- public/images/island/about-mactan-coast.webp: new optimized, licensed 1800×1200 photo (~320KB).
- docs/about-redesign.md and docs/screenshots/about/ (all five screenshots and verification.json).

## Photography sources and rights

| Placement | Local asset | Original / author | License |
| --- | --- | --- | --- |
| Hero | public/images/island/about-mactan-coast.webp | [Blue waters beach philippines mactan.jpg](https://commons.wikimedia.org/wiki/File:Blue_waters_beach_philippines_mactan.jpg), Øyvind Holmstad, July 17, 2017 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Island experience | public/images/island/cordova-sunset.webp | [Sunset in Cordova (Cebu Province, Philippines).jpg](https://commons.wikimedia.org/wiki/File:Sunset_in_Cordova_(Cebu_Province,_Philippines).jpg), Carl Griño, December 21, 2020 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

Both original Commons file descriptions were checked for source, authorship and licenses. These licenses allow commercial reuse with attribution and ShareAlike; WebP adaptations retain CC BY-SA 4.0. Captions provide author, original source, license link and resize/conversion/crop disclosure. Destination images are identified as historical inspiration, not KJM premises or promised beach access.

Neither source is used on the homepage. The hero is a new source; the sunset is also used on How It Works, which was not modified. About uses two distinct photographs. No AI imagery or fabricated image source. The previously considered night-time LED-rose image was not used because it does not show the desired coast.

Next Image supplies fill layout with fixed responsive container heights, sizes, hero preload and lazy secondary image loading. The browser verification file records both image fallback src and actual responsive currentSrc. No images are duplicated in public/ under a renamed file to simulate new photography.

## Animations and accessibility

Gentle headline/image entrances and section reveals, small CTA lift and arrow movement. Text entrance opacity starts at 0.95 to maintain readable contrast throughout; the first browser audit caught the earlier low-opacity version and it was corrected. Sections remain visible if JavaScript or animations fail. Reduced-motion disables all About animation and transitions; global reduced-motion scrolling behavior remains respected.

Semantic section headings/figures/ordered steps, accurate alt text, decorative icons hidden from assistive technology, visible keyboard focus and 52px primary CTA targets. Links use real existing routes. No motion library or auto-play/parallax effects.

## Verification

- TypeScript passed after build regenerated route types for the moved page. Initial run reported stale generated references to the former route path.
- ESLint passed.
- All existing tests passed: 43 tests in 8 files.
- Production build passed. Twenty existing homepage CSS :global-selector warnings remain outside this change.
- Actual isolated Chromium tested the production build at 360, 390, 768, 1024 and 1440px; screenshots visually inspected at all five widths.
- No horizontal overflow at any width. Headline is 44px on phones, 51.2px at 1024px and 72px at 1440px. Mobile margin 20px; tablet/desktop gutters 24px with a centered 1160px maximum content width.
- Both photographs load and use object-fit cover with bounded responsive frames; crops visually inspected. Both primary CTA targets are 52px high and the final button renders coral correctly.
- Keyboard focus passes; reduced-motion animation/transition checks pass; Explore Cebu, How It Works and Explore Motorcycles navigation passes at each width.
- Axe WCAG 2 A/AA and 2.1 AA: zero About-main violations at all five widths. No page JavaScript errors.
- JavaScript-disabled Chromium: hero and final CTA content remain visible.

## Screenshots

Full-page captures: docs/screenshots/about/about-360.png, about-390.png, about-768.png, about-1024.png and about-1440.png. Automated measurements/results: verification.json in the same directory.

## Remaining issues and scope

No known About layout or interaction failures in tested Chromium. Safari, Firefox and physical devices were not tested. Photography shows historical destination views. Existing homepage CSS Module warnings remain outside About scope.

No Supabase writes, migrations, price, booking logic, admin, public-booking enablement, auth, Telegram, Resend, payment gateway or deployment changes.

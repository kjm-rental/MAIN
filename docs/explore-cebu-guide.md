# Explore Cebu guide

Destination content is maintained in `src/lib/content/destinations.ts`. No CMS or database is involved. Content researched October 10, 2026. Venue hours, fees, parking and road access are deliberately not guaranteed.

## Research sources

- Mactan Shrine: [NHCP Lapulapu registry](https://philhistoricsites.nhcp.gov.ph/registry_database/lapulapu/).
- 10,000 Roses Café: [Lakwatsero destination report](https://www.lakwatsero.com/spots/10000-roses-cafe-cordova-cebu/), corroborated by Cordova tourism search information and the Ascott lyf Cebu visitor guide.
- Magellan’s Cross: [NHCP registry](https://philhistoricsites.nhcp.gov.ph/registry_database/the-cross-of-magellan/).
- Temple of Leah: [Cebu highlands guide](https://cebu.travel/guides/cebu-highlands-guide), corroborated by the Ascott lyf Cebu visitor guide and geolocated Commons photography. This is a travel-guide source, not a claim of official tourism endorsement.
- Sirao Flower Garden: [Travel Cebu](https://www.travelcebu.ph/blog/sirao-flower-garden/), corroborated by [Cebu Province](https://www.cebu.gov.ph/about/). Neighboring Sirao gardens are not treated as interchangeable.
- Tops Lookout: [official venue information](https://www.topscebu.ph/tickets-and-park-information).

## Photography

Each image’s original Commons file URL, photographer and license version is stored with its destination. Full clickable attribution is rendered on /photo-credits; each destination and the hero links to its attribution.

| Destination | Photographer | License | Asset |
| --- | --- | --- | --- |
| Mactan Shrine | Patrickroque01 | CC BY-SA 4.0 | shrine.webp |
| 10,000 Roses | Øyvind Holmstad | CC BY-SA 4.0 | roses.webp |
| Magellan’s Cross | Joshua Lim (Sky Harbor) | CC BY-SA 3.0 | cross.webp |
| Temple of Leah | Ralff Nestor Nacor | CC BY-SA 4.0 | temple.webp |
| Tops Lookout (also hero) | Patrickroque01 | CC BY-SA 4.0 | tops.webp |
| Sirao Flower Garden | Martin Michlmayr | CC BY-SA 4.0 | sirao.webp |

Images downloaded from original Wikimedia uploads, visually inspected, resized to at most 1800px wide and converted to WebP. Cropping is done responsively via Next Image. Image adaptations retain their corresponding ShareAlike license; this does not relicense unrelated application code. Historical photos are not representations of current conditions. No generated destination imagery used.

## Verification

- Lint and TypeScript passed.
- Vitest: 38 tests passed, including three new destination-content regression tests.
- Production webpack build passed.
- Microsoft Edge browser: 360, 390, 768, 1024 and 1440px; no horizontal overflow; all six rendered images (including the repeated Tops hero) loaded; six named map links.
- axe WCAG 2 A/AA and 2.1 AA: zero violations at each tested width. Automated checks do not certify accessibility; manual review also covered text placement, photographic overlays, responsive crops and mobile layout.
- Area navigation and photo-credit anchors verified.
- Original photo and Creative Commons license links returned HTTP 200.
- All six destination-source links and six Google Maps links returned HTTP 200. This confirms link availability, not map-route suitability or venue admission.
- Google Maps identifies locations, not validated motorcycle routes. Check live road restrictions and conditions before riding.

No changes to Supabase, booking settings, prices, inventory or KJM ADMIN. No deployment.

## Photography and How It Works follow-up

Sirao was the only missing destination photograph. It now uses [Original Sirao Garden 2022 05 009](https://commons.wikimedia.org/wiki/File:Original_Sirao_Garden_2022_05_009.jpg), by Martin Michlmayr, photographed May 7, 2022, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The Commons description, Original Sirao Garden Little Amsterdam category, coordinates (10.406849, 123.866826), and visible Sirao Garden sign establish the venue. It is not the neighboring Sirao Pictorial Garden. The image shows decorative windmills and planted terraces; it does not guarantee current blooms. The locally optimized WebP is 1800 × 1350. No destination image is now missing.

How It Works reuses the existing licensed Mactan beach image by Lsj (CC BY-SA 3.0) and Tops photograph by Patrickroque01 (CC BY-SA 4.0). Both carry visible attribution links. No unrelated imagery is labeled as an attraction and no new fictional lifestyle imagery was generated.

Changed files in this follow-up:

- src/app/(website)/explore-cebu/page.tsx — consistent 4:3 mobile/card crops, smaller wide-image minimum, refined category labels, subtle shadows and map-action pills.
- src/app/(website)/how-it-works/page.tsx — compact split photographic hero, seven-step connected timeline, editorial travel panel, requirements and launch restriction messaging, final catalog CTA.
- src/app/(website)/how-it-works/journey.module.css — scoped timeline styling and reduced-motion-aware line/marker animation.
- src/lib/content/rental-journey.ts and rental-journey.test.ts — editable seven-stage content and three process-message regression tests.
- src/lib/content/destinations.ts and destinations.test.ts — Sirao attribution and six-image regression coverage.
- public/images/destinations/sirao.webp — new licensed local asset.
- docs/explore-cebu-guide.md and docs/screenshots/guide-refresh/ — evidence and review screenshots.

Verification: lint, TypeScript, all 41 Vitest tests, and production webpack build passed. Microsoft Edge checks on BOTH pages at 360, 390, 768, 1024 and 1440px verified every main image loaded and no horizontal overflow. axe WCAG 2 A/AA and 2.1 AA found zero violations in all ten runs. Manual desktop/mobile screenshot review covered hero contrast, photo crops, timeline, cards and typography. All seven journey items render. The timeline pseudo-element reports animation-name:none under reduced motion. The generated /photo-credits#sirao section includes the photographer, source and license. Screenshots are saved under docs/screenshots/guide-refresh/.

Remaining limitations: photos are historical; live venue appearance, opening hours, access and blooms must still be checked with venues. Automated accessibility tests are not a certification. Public booking stays restricted. Nothing was deployed.

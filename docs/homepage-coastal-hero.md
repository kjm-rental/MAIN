# Homepage coastal riding hero

Asset: `public/images/island/cebu-coastal-ride-v2.webp` (1774 × 887, 336,820 bytes).

Created with the built-in image generation tool on October 12, 2026 for this project at the user's request. This is a generated Cebu-inspired travel scene, not documentary photography of a specific road. No external image host is required.

## Generation prompt

Use case: photorealistic-natural. Asset type: wide homepage background photograph for a premium Cebu motorcycle rental website. Create a realistic professional editorial travel photograph, landscape 16:9. A helmeted adult riding a modern unbranded dark teal automatic scooter on a beautiful paved Philippine coastal road inspired by Cebu, palms, lush tropical greenery, turquoise ocean and distant island hills. Natural bright welcoming daylight, realistic colors and textures, candid freedom and island adventure, no artificial advertisement styling. Composition is critical: entire scooter including both wheels clearly visible, three-quarter front/side view, rider and scooter mainly in the CENTER-RIGHT, centered at approximately 67 percent horizontal and 38 percent vertical, occupying roughly 25 percent of width. Keep the left 40 percent a calm uncluttered coastal landscape for white headline overlay. Keep lower-right road unobtrusive for a booking card placed below the motorcycle. Ocean and palm trees clearly visible. Anatomically natural rider, hands on handlebars, safe helmet, realistic scooter mechanics and road perspective. No text, logos, watermark, promotional graphics or UI. The image should evoke Cebu without claiming a specific documented road.

## Implementation

## Reference revision prompt (current asset)

Use case: photorealistic-natural. Create ONLY a full-bleed background photograph inspired by the user's attached website screenshot, not a website mockup. Wide landscape 2:1 composition. Professional realistic Cebu-inspired Philippine coastal travel photography: helmeted adult with black backpack riding a modern dark automatic scooter AWAY from the camera, rear three-quarter view, both wheels and whole motorcycle clearly visible. Rider and scooter centered at 58 percent of image width, occupy horizontal region 49 to 66 percent and vertical region 35 to 94 percent. Keep rightmost 30 percent free of the rider for an overlaid booking card. Leftmost 42 percent shows expansive turquoise ocean, distant green island mountains, blue sky and an unobtrusive low stone coastal wall, generous room for white website copy. Paved coastal road curves into the distance on the far right, coconut palms and natural tropical greenery along right side, bright natural daylight, realistic island colors. Similar rear-view adventure composition to attached reference. No text, UI, cards, logos, watermark, advertisement graphics. Natural travel photograph with convincing scooter geometry and rider anatomy.

## Presentation

Only the homepage hero presentation and its image-variety assertion changed. The existing booking component, prices, restrictions, date/time controls, availability checks and submission behavior remain unchanged. The revised background follows the user’s screenshot: a rear-view rider with a backpack on a palm-lined coastal road. The desktop photo fills the entire hero, with the card alongside the rider. The desktop gradient is strongest behind the left text and light over the rider. The mobile photo occupies a reserved space between the copy and booking card, preserving the rider without overlapping either. Next Image preloads and serves responsive sizes; the photo space is reserved before loading.

## Validation

- Visually checked screenshots at 320, 390, 768, 1024, 1440 and 1920 px; no horizontal overflow. The full scooter remains visible, text stays readable and the booking card remains unobstructed.
- Opened the existing date/time dialog at 390 and 1440 px and confirmed it fits the viewport. No availability requests or booking submissions were made.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- src/lib/content/image-variety.test.ts`: 2 tests passed.
- `npm run build`: passed. Existing `home-motion.module.css` global-selector warnings remain outside this change.
- Screenshot evidence: `docs/screenshots/hero-coastal/hero-{width}.png`.
- No deployment; KJM ADMIN and Supabase were not modified.

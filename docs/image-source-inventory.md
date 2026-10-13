# KJM MAIN image audit and visual-variety correction

Audit: October 10, 2026. Scope: every source image reference in src/ and every asset in public/. Public catalog media metadata was inspected read-only with the public application credentials. No private records or documents were read.

## Original duplicate-source findings

| Source photograph | Before | After |
| --- | --- | --- |
| Mactan-beach.jpg by Lsj | Homepage hero, Why KJM, island adventure; How It Works hero (4 placements) | Homepage hero only |
| Tops city panorama by Patrickroque01 | Explore Cebu hero and Tops card; How It Works editorial panel (3 placements) | Tops destination card only |

Different crops, overlays and responsive Next Image renditions were grouped by original Commons source identity, not treated as different assets. The six destination photographs represent different scenes and original files. SHA-256 checks found no exact duplicate local assets; downloaded images were visually inspected, including contact sheets. This is not a guarantee that an unknown off-site admin upload has never been derived from another image.

## Complete local photograph inventory

Paths below are relative to public/. Attribution and source links are publicly rendered at /photo-credits.

| File | Original source / photographer | License | Current placement | Repeated source? |
| --- | --- | --- | --- | --- |
| images/island/mactan-beach.jpg | [Mactan-beach.jpg](https://commons.wikimedia.org/wiki/File:Mactan-beach.jpg), Lsj | CC BY-SA 3.0 | Homepage beach hero | No |
| images/island/lapu-lapu-boat.webp | [Cebu Dive Trip 2026-01-04 002.jpg](https://commons.wikimedia.org/wiki/File:Cebu_Dive_Trip_2026-01-04_002.jpg), Martin Michlmayr | CC BY-SA 4.0 | Homepage Why KJM lifestyle | No |
| images/island/mactan-road.webp | [Mactan-Mandaue Bridge.jpg](https://commons.wikimedia.org/wiki/File:Mactan-Mandaue_Bridge.jpg), Mike Gonzalez (TheCoffee) | CC BY-SA 3.0 | Homepage island adventure | No |
| images/island/cordova-sunset.webp | [Sunset in Cordova](https://commons.wikimedia.org/wiki/File:Sunset_in_Cordova_(Cebu_Province,_Philippines).jpg), Carl Griño | CC BY-SA 4.0 | How It Works hero | No |
| images/destinations/shrine.webp | [Mactan Shrine Magellan marker](https://commons.wikimedia.org/wiki/File:Mactan_Shrine_Magellan_marker_(Punta_Engaño_Road,_Lapu-Lapu_City,_Cebu;_01-19-2024).jpg), Patrickroque01 | CC BY-SA 4.0 | Explore Cebu: Mactan Shrine | No |
| images/destinations/roses.webp | [Cc 10000 roses Mactan.jpg](https://commons.wikimedia.org/wiki/File:Cc_10000_roses_Mactan.jpg), Øyvind Holmstad | CC BY-SA 4.0 | Explore Cebu: 10,000 Roses | No |
| images/destinations/cross.webp | [Magellan's Cross full.jpg](https://commons.wikimedia.org/wiki/File:Magellan%27s_Cross_full.jpg), Joshua Lim (Sky Harbor) | CC BY-SA 3.0 | Explore Cebu: Magellan’s Cross | No |
| images/destinations/temple.webp | [Temple of Leah, Cebu City, Jan 2024.jpg](https://commons.wikimedia.org/wiki/File:Temple_of_Leah,_Cebu_City,_Jan_2024.jpg), Ralff Nestor Nacor | CC BY-SA 4.0 | Explore Cebu: Temple of Leah | No |
| images/destinations/sirao.webp | [Original Sirao Garden 2022 05 009.jpg](https://commons.wikimedia.org/wiki/File:Original_Sirao_Garden_2022_05_009.jpg), Martin Michlmayr | CC BY-SA 4.0 | Explore Cebu: Sirao Flower Garden | No |
| images/destinations/tops.webp | [Cebu City south view from Tops Lookout](https://commons.wikimedia.org/wiki/File:Cebu_City_south_view_from_Tops_Lookout_(Cebu_City;_09-06-2022).jpg), Patrickroque01 | CC BY-SA 4.0 | Explore Cebu: Tops | No |

All selected Creative Commons licenses permit commercial reuse subject to attribution and ShareAlike. Local WebP adaptations retain those licenses. Source links identify original photographs; credit pages disclose conversion and cropping. Commons object-copyright information for the old bridge identifies it as ordinary engineering infrastructure. No CCLEX photograph was used or presented as a permitted motorcycle route.

New asset dimensions / sizes: boat 1800×1012, 430,832 bytes; road bridge 1000×500, 66,768 bytes; sunset 1800×831, 50,676 bytes. Existing hero is 2885×2144, 1,007,200 bytes. All photographic rendering uses responsive Next Image optimization. Bridge is not upscaled on disk; its smaller source is suitable for its roughly half-width card, not a full-screen hero.

## Dynamic admin-managed motorcycle photographs

Public Storage base: https://slevojynuumrvgiznmxk.supabase.co/storage/v1/object/public/motorcycle-catalog/

| Model | Storage path |
| --- | --- |
| Yamaha Mio Gravis 125cc | 183e8f6d-5a40-423b-b7e2-51589b548b4d/cbfcf5e4-458b-42f7-861d-42bce6abddf2.png |
| Honda Click 125cc | cf24bed9-0ab3-45b8-a107-cd6ce59ac7fd/a3cb56a6-0cfc-47b5-920c-617d4b8e72ae.png |
| Honda Click 160cc | 64720cfd-e3a1-4223-98d1-bcbc9a3fb3ae/1eb84d16-2a4b-4e16-b8bb-b0003400025d.png |
| Yamaha Aerox 160cc | 667d3049-5d09-4998-97d7-03d7485052aa/a0326248-60ec-4391-8cbe-fa9e22b2b407.png |
| Honda PCX 160cc | 69ea75b7-0a6e-4931-94c8-2762a64b5d21/6ec8bb27-639b-4b90-b08a-c67a1503dedf.png |
| Yamaha NMAX 155 V3 | 609709ab-6952-4ec3-9a13-0a292bb8d52d/563dfd2a-c500-4192-9b6d-fcd9733c76e6.png |
| Honda ADV 160 | fcf80dc3-425f-4e9f-9ede-a6b3c93d0680/890b02d6-13d6-4ad9-8621-d6f62f908358.png |
| Suzuki V-Strom 160 | f83dec69-7afc-497d-b9d2-16aa754978fb/efc241f4-785c-4a8d-95b7-6d3977a4b872.png |
| Honda ADV 350 | be131d5a-e672-423c-8455-e9dbfd79168a/ee9dd92c-3a3b-4b7a-8f3e-b160db684a12.png |

All nine are administrator-marked business_owned and verified, with source URL https://kjmmotorcyclerental.com/business-owned-media and note “Uploaded by an authenticated KJM administrator as business-owned media.” These are database assertions, not independently examined ownership releases; photographer identity is not recorded. KJM should retain original rights evidence and confirm these depict its own vehicles. No catalog images or metadata were changed.

Usage: all in /motorcycles, their corresponding detail galleries and booking summaries; cheapest three also in homepage featured cards; related model recommendations reuse catalog photos intentionally to identify the same motorcycle, not as promotional lifestyle photography. This functional reuse is preserved. Query retains published/non-archived filtering and verified permission metadata checks.

## Other image surfaces and fallbacks

- Booking extras: optional admin-managed image_path in public booking-extras Storage, rendered only when an item supplies one. Source/photographer/license is not exposed by this component. No private checkout data was requested and no live booking was created; current extras image ownership remains a management verification limitation.
- Verification documents are private customer data, not public website photography. They were not accessed or inventoried.
- MotorcycleVisual’s no-media state is a code-native Camera/Waves illustration explicitly labeled photography pending approval. Never a substitute motorcycle or beach image.
- Explore Cebu’s defensive missing-image fallback remains code-native; all six current destinations have licensed photos.
- Explore Cebu hero and How It Works travel panel now use lightweight inline route/coastal illustrations, explicitly labeled not a real route map. Icons are supplied by the existing Lucide dependency. No third-party photograph or invented geographic route involved.
- KJM logo/wave graphics are inline code-native branding, not photographic assets. public/images/.gitkeep is not an image. No CSS background image URLs, renamed photo copies or other public raster assets were found.

## Missing / unsuitable assets

- No destination is missing imagery.
- A genuine KJM motorcycle-in-use lifestyle shoot is still desirable. Requirement: original high-resolution landscape photograph (ideally at least 2400px wide) of a KJM motorcycle on a permitted Mactan/Cebu coastal road, helmeted rider, safely stationary photographer, written commercial photography/model permissions, exact location, photographer and date. Do not identify a stock motorcycle as KJM’s unit.
- Until such a shoot exists, the adventure section uses an accurately identified historical coastal road-bridge photograph—not fabricated riding imagery or a repeated hero.
- Rejected aerial candidate “Cebu coastline from the air (49537057808).jpg”: detailed source describes a shipyard in Consolacion. Not downloaded or mislabeled as a Mactan lifestyle scene.
- No current road access, parking, beach access, boat service or venue appearance is guaranteed. Historical photographs are identified as inspiration, not KJM premises.

## Changed implementation

home-sections.tsx, how-it-works/page.tsx, explore-cebu/page.tsx, photo-credits/page.tsx; new editorial-images.ts, editorial-photo-credit.tsx, island-journey-illustration.tsx, image-variety.test.ts; three local WebP assets; this report and docs/screenshots/image-variety/.

No database writes, migrations, booking rules, prices, auth settings, KJM ADMIN edits or deployment.

## Verification and screenshots

- Lint and TypeScript passed.
- Vitest: 43 tests passed, including two new image-source-variety regressions.
- Production webpack build passed.
- Actual Microsoft Edge browser: homepage, Explore Cebu and How It Works at 390, 768 and 1440px (nine runs). All main images loaded; zero horizontal overflow; zero axe WCAG 2 A/AA and 2.1 AA violations.
- Browser image-source inventory: homepage has beach + boat + bridge, Explore Cebu has six distinct destination photos, How It Works has sunset only. No duplicate promotional photo path across those pages. Catalog photos intentionally remain reusable for the same product.
- Manual desktop homepage and mobile How It Works screenshot review confirmed distinct compositions, correct geographic labeling and readable overlays. Boat and sunset use bottom-only gradients for their overlaid copy; bridge and destination photos retain natural color without full teal tinting.
- Before and after full-page screenshots are in docs/screenshots/image-variety/: before-{home,explore-cebu,how-it-works}-{390,1440}.png and after-{home,explore-cebu,how-it-works}-{390,768,1440}.png.
- No automated performance benchmark or exhaustive worldwide copyright-rights investigation was performed. Asset dimensions, compressed sizes, responsive sizes and local Next Image loading were checked. Admin upload rights remain KJM’s responsibility.

# Motorcycle catalog research

Last reviewed: 2026-10-09 (Asia/Manila)

## Scope and publication rule

This file separates manufacturer-reference research from facts about KJM's physical rental units. A manufacturer specification is published only when the named model is supported by a primary manufacturer source. It does **not** establish the year, variant, condition, accessories, or availability of any KJM unit. KJM must provide a registration/model-year record or unit identification before variant-specific claims can be treated as fleet facts.

Descriptions in the application are original KJM copy. They do not promise availability, included equipment, rental terms, or suitability for a particular rider.

## Image licensing audit

No business-supplied photographs were present in the workspace. The manufacturer pages below contain useful reference photography, but their site footers and pages do not grant KJM a commercial reuse license. No manufacturer image was downloaded, hotlinked, copied, or presented as a KJM rental unit.

All ten models therefore use the branded, accessible “Photography pending approval” placeholder. The future `motorcycle-catalog` Supabase Storage bucket accepts AVIF, WebP, JPEG, and PNG files, but no files are uploaded by this change. Before publication, record the owner/source, written permission or commercial license, alt text, and verification status in `motorcycle_media`.

Acceptable next inputs are:

- original photos supplied by KJM with confirmation that KJM owns or may use them;
- a manufacturer media-library asset accompanied by express website-use permission; or
- a commercial-use asset whose license covers this business website and accurately represents only a reference model.

Reference photography must be captioned as a manufacturer reference and must never imply it depicts the actual rental unit.

## Research register

| Client catalog label    | Manufacturer source and market                                                                                                                               | Verified reference details                                                                                                                                                                             | Status / unresolved work                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Honda Beat              | [Honda Philippines BeAT/Click125 brochure](https://cms.hondaph.com/files/products/650bce64c3201.pdf), Philippines, brochure year not stated in file metadata | Exact manufacturer styling is `BeAT`; 110 cc; automatic V-Matic; air-cooled; electric and kick ACG starter; automatic scooter                                                                          | **Reference only.** Honda PH brochures show generation/variant differences, including 4.0 L versus 4.2 L tanks and brake equipment. Confirm KJM year and variant.                         |
| Yamaha Mio Gravis 125cc | [Yamaha Motor Philippines Mio Gravis page](https://www.yamaha-motor.com.ph/motorcycles/personal-commuter/mio-series/mio-gravis), Philippines                 | Yamaha confirms the `Mio Gravis` model name and automatic-scooter positioning                                                                                                                          | **Pending.** The current page did not expose a specification sheet usable for matching KJM's year/variant. Do not publish displacement or hardware solely from the client label.          |
| Honda Click 125cc       | [Honda Philippines Click125 brochure](https://cms.hondaph.com/files/products/69847c092a3af.pdf), Philippines, 2026 model reference                           | `Click125`; 125 cc; V-Matic; 5.5 L; liquid-cooled; electric start; front hydraulic disc/rear drum with CBS; LED lighting; USB Type-C; 18 L luggage box                                                 | **Manufacturer source verified.** Standard and Smart Edition features differ. Confirm KJM unit year/variant.                                                                              |
| Honda Click 160cc       | [Honda Philippines Click160 brochure](https://cms.hondaph.com/files/products/62da5a937198e.pdf), Philippines                                                 | `Click160`; actual displacement 157 cc; V-Matic; 5.5 L; liquid-cooled; electric ACG starter; front disc/rear drum with CBS; smart key; USB; LED lighting                                               | **Manufacturer source verified.** Confirm KJM unit year.                                                                                                                                  |
| Yamaha Aerox 160cc      | [Yamaha Philippines YECVT page](https://www.yamaha-motor.com.ph/yecvt), Philippines, current page                                                            | Yamaha currently names `AEROX` and `AEROX SP`; the page confirms variant-specific YECVT only                                                                                                           | **Name/displacement pending.** Yamaha does not call the referenced Philippine product “Aerox 160cc.” Confirm registration/model year and Standard/SP variant before publishing any specs. |
| Honda PCX 160cc         | [Honda Philippines PCX160 brochure](https://cms.hondaph.com/files/products/64c22fd79c9ca.pdf), Philippines                                                   | `PCX160`; actual displacement 157 cc; V-Matic; 8.0 L; liquid-cooled; electric ACG starter; smart key; USB Type-C; 30 L luggage box                                                                     | **Core manufacturer specs verified.** Braking/ABS is variant-dependent and remains unpublished until KJM's variant is known.                                                              |
| Yamaha NMAX 155 V3      | [Yamaha Philippines YECVT page](https://www.yamaha-motor.com.ph/yecvt), Philippines, current page                                                            | KJM confirms the V3 generation; Yamaha confirms `NMAX Tech MAX` and variant-specific YECVT                                                                                                             | **Pending.** The V3 trim, color and model year are not confirmed. Leave variant-dependent technical fields and photography unpublished.                                                   |
| Honda ADV 160           | [Honda Philippines ADV160 launch information](https://www.hondaph.com/motorcycle/news/discover-new-excitement-with-the-all-new-adv160), Philippines          | `ADV160`; actual displacement 157 cc; V-Matic; 8.1 L; liquid-cooled; electric ACG starter; front/rear disc with front ABS; HSTC; adjustable windscreen; USB                                            | **Manufacturer source verified.** Confirm KJM unit year.                                                                                                                                  |
| Suzuki V-Strom 160      | [Suzuki Motorcycles Philippines V-STROM 160](https://mc.suzuki.com.ph/motorcycles/backbone/v-strom-160/), Philippines, current 2026 listing                  | Exact official name `V-STROM 160`; actual displacement 162 cc; 5-speed manual; 13 L; air-cooled; electric start; front/rear disc with dual-channel ABS; digital panel; USB; adjustable rear suspension | **Manufacturer source verified.** This resolves the earlier naming ambiguity as of 2026. Confirm KJM's unit is the newly listed Philippine model.                                         |
| Honda ADV 350           | [Honda UK ADV350 specifications](https://www.honda.co.uk/motorcycles/range/scooter/adv350/specification-and-price.html), UK, 2026 reference                  | Exact name `ADV350`; actual displacement 330 cc (not 350 cc); CVT; 11.7 L; liquid-cooled; electric; front/rear hydraulic discs with ABS; HSTC; adjustable windscreen; smart key                        | **Reference only.** No KJM market/year/variant evidence is available, and this is a UK rather than Philippine-market reference.                                                           |

## Required business confirmation

For each physical rental unit, collect manufacturer/VIN plate photos or registration details sufficient to establish the model year and variant. Highest-priority questions:

1. Is “Yamaha Aerox 160cc” an AEROX Standard, AEROX SP, or another year/market designation?
2. Which NMAX variant and model year is offered?
3. Which Mio Gravis and Honda BeAT generations/variants are offered?
4. Is the V-STROM 160 the current Philippine 162 cc, five-speed model?
5. What market and model year is the ADV350 unit?
6. Can KJM supply original unit photography and written confirmation of website-use rights?

## Asset checklist

| Model                 | Approved local image | Source/license record                      | Current display     |
| --------------------- | -------------------- | ------------------------------------------ | ------------------- |
| All 10 catalog models | None                 | Pending business asset or explicit license | Branded placeholder |

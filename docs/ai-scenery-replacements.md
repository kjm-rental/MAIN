# AI scenery replacements

October 14, 2026. Ten original scenes generated with the built-in image-generation tool, visually reviewed and converted to WebP at quality 85 without upscaling. Landscape compositions match the existing editorial panels; destination cards retain their 4:3 containers. No layout CSS, inventory photography, booking, payment, database or ADMIN changes.

Images are Cebu-inspired illustrations, not documentary photographs of landmarks, businesses or routes. Captions and alt text disclose AI generation; destination cards explicitly state they do not show the actual venue. The existing AI coastal-riding hero remains unchanged. The former /photo-credits route now explains image provenance and preserves existing links. Historical photo-source documentation is retained as an audit record, not as current website attribution.

| New asset | Dimensions | Size | Generated original |
| --- | --- | --- | --- |
| public/images/island/coastal-bridge-ai.webp | 1774 × 887 | 334 KB | exec-6bf87f91-9e99-4fed-9d0a-aa9e1f5e09c3.png |
| public/images/island/fishing-banca-ai.webp | 1672 × 941 | 295 KB | exec-07658597-25bd-4874-9172-aa0abfbf8444.png |
| public/images/island/tropical-beach-ai.webp | 1536 × 1024 | 318 KB | exec-517d262f-5d3d-4de8-b113-a93bf2f5cd28.png |
| public/images/island/coastal-sunset-ai.webp | 1800 × 833 | 182 KB | exec-0990a631-d505-414e-94b8-71c7f185424b.png |
| public/images/destinations/heritage-garden-ai.webp | 1448 × 1086 | 481 KB | exec-c768bc6d-714b-436a-9ca1-2fca3fb0a10e.png |
| public/images/destinations/coastal-lights-ai.webp | 1448 × 1086 | 257 KB | exec-f9222549-1208-4936-9b61-695cbd9caa5b.png |
| public/images/destinations/heritage-streetscape-ai.webp | 1448 × 1086 | 465 KB | exec-c91c7788-3827-409a-98eb-67d0c44a03e8.png |
| public/images/destinations/hilltop-colonnade-ai.webp | 1448 × 1086 | 325 KB | exec-32a5a04e-20ec-48cc-ae87-db57994540ab.png |
| public/images/destinations/highland-flowers-ai.webp | 1448 × 1086 | 456 KB | exec-3e28a718-f00a-42e8-bcb5-289cbada52dd.png |
| public/images/destinations/highland-panorama-ai.webp | 1448 × 1086 | 290 KB | exec-cb56776f-16a2-446a-ab24-4707cb957d60.png |

Original PNGs are retained in the generation tool’s output directory; project references use only local optimized WebP assets. Superseded licensed images, including the unused Mactan beach image, were removed from public assets after their website references were replaced.

Validation: 5 focused content tests passed; TypeScript check and focused ESLint passed; git diff whitespace check passed. Local HTTP smoke checks returned 200 for home, About, Explore Cebu, How It Works and image-information pages; all 10 WebP assets served correctly. No live booking or payment was initiated. Source aspect containers and responsive sizes remain unchanged. Temporary local test server stopped afterward.

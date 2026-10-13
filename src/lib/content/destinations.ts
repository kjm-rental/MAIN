export const destinationGroups = [
  {
    id: "mactan",
    title: "Explore Mactan & Nearby",
    intro: "Island history and coastal evenings.",
  },
  {
    id: "city",
    title: "Discover Cebu City",
    intro: "A deeper connection to Cebu’s story.",
  },
  {
    id: "highlands",
    title: "Scenic Highlands",
    intro: "Look up. The hills hold another side of Cebu.",
  },
] as const;
const commons = (file: string) =>
  "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(file);
export const destinations = [
  {
    id: "mactan-shrine",
    name: "Mactan Shrine",
    location: "Punta Engaño, Lapu-Lapu City",
    category: "History",
    group: "mactan",
    description:
      "Begin with the island’s story. This memorial site commemorates the Battle of Mactan and Lapulapu’s resistance in 1521, with monuments and historical markers to explore.",
    note: "Explore on foot and respect designated visitor areas.",
    source: "https://philhistoricsites.nhcp.gov.ph/registry_database/lapulapu/",
    image: {
      src: "/images/destinations/shrine.webp",
      alt: "Historic Magellan monument in the grounds of Mactan Shrine",
      author: "Patrickroque01",
      file: commons(
        "Mactan Shrine Magellan marker (Punta Engaño Road, Lapu-Lapu City, Cebu; 01-19-2024).jpg",
      ),
      license: "4.0",
    },
  },
  {
    id: "roses",
    name: "10,000 Roses Café",
    location: "Day-as, Cordova",
    category: "Coastal",
    group: "mactan",
    description:
      "A seaside pause with a distinctive glow. Thousands of artificial LED roses create a luminous coastal garden beside this Cordova café.",
    note: "Check current hours and admission with the venue. These are artificial roses, not a flower farm.",
    source: "https://www.lakwatsero.com/spots/10000-roses-cafe-cordova-cebu/",
    image: {
      src: "/images/destinations/roses.webp",
      alt: "Illuminated white LED roses at 10,000 Roses Café after dark",
      author: "Øyvind Holmstad",
      file: commons("Cc 10000 roses Mactan.jpg"),
      license: "4.0",
    },
  },
  {
    id: "cross",
    name: "Magellan’s Cross",
    location: "Magallanes Street, Cebu City",
    category: "History",
    group: "city",
    description:
      "Step into Cebu’s historic heart. The cross inside its painted pavilion is an enduring landmark of the city’s early Christian history, close to the Basilica del Santo Niño.",
    note: "Park only where permitted and explore the heritage area on foot.",
    source:
      "https://philhistoricsites.nhcp.gov.ph/registry_database/the-cross-of-magellan/",
    image: {
      src: "/images/destinations/cross.webp",
      alt: "Magellan’s Cross beneath the painted ceiling of its pavilion",
      author: "Joshua Lim (Sky Harbor)",
      file: commons("Magellan's Cross full.jpg"),
      license: "3.0",
    },
  },
  {
    id: "temple",
    name: "Temple of Leah",
    location: "Busay, Cebu City",
    category: "Architecture",
    group: "highlands",
    description:
      "Grand columns meet a hillside setting. This monumental landmark in Busay pairs classical-inspired architecture with views across Cebu.",
    note: "Check highland road conditions and venue access before setting out.",
    source: "https://cebu.travel/guides/cebu-highlands-guide",
    image: {
      src: "/images/destinations/temple.webp",
      alt: "Columned facade and courtyard of Temple of Leah",
      author: "Ralff Nestor Nacor",
      file: commons("Temple of Leah, Cebu City, Jan 2024.jpg"),
      license: "4.0",
    },
  },
  {
    id: "sirao",
    name: "Sirao Flower Garden",
    location: "Barangay Sirao, Cebu City",
    category: "Nature",
    group: "highlands",
    description:
      "Trade the city skyline for colorful flower beds in Cebu’s highlands. This garden offers a softer, slower kind of sightseeing; blooms vary with the season.",
    note: "Several gardens use the Sirao name. Confirm the exact venue, current blooms and access before visiting.",
    source: "https://www.travelcebu.ph/blog/sirao-flower-garden/",
    image: {
      src: "/images/destinations/sirao.webp",
      alt: "Decorative windmills and planted terraces at the Original Sirao Garden",
      author: "Martin Michlmayr",
      file: commons("Original Sirao Garden 2022 05 009.jpg"),
      license: "4.0",
    },
  },
  {
    id: "tops",
    name: "Tops Lookout",
    location: "Tops Road, Busay, Cebu City",
    category: "Scenic",
    group: "highlands",
    description:
      "See the city from a different perspective. This elevated lookout offers a sweeping panorama across Metro Cebu, with the view changing as daylight fades.",
    note: "The official venue shuttle is an alternative if you prefer not to ride the highland approach.",
    source: "https://www.topscebu.ph/tickets-and-park-information",
    image: {
      src: "/images/destinations/tops.webp",
      alt: "Panoramic view over Cebu City photographed from Tops Lookout",
      author: "Patrickroque01",
      file: commons(
        "Cebu City south view from Tops Lookout (Cebu City; 09-06-2022).jpg",
      ),
      license: "4.0",
    },
  },
];
export type Destination = (typeof destinations)[number];
export function destinationMapUrl(d: Destination) {
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(d.name + ", " + d.location + ", Philippines")
  );
}

export const businessContact = {
  name: "KJM Motorcycle Rental",
  address: "Purok Gumamela, Locatha, Looc, Lapu-Lapu City, Cebu, Philippines",
  branchAddress: "Lo-oc, Locatha, Lapu-Lapu City, 6015 Cebu, Philippines",
  phone: "0975 298 4845",
  internationalPhone: "+63 975 298 4845",
  telephoneUrl: "tel:+639752984845",
  email: "kjm.moto.rental@gmail.com",
  website: "https://kjmride.com",
} as const;

export const directionsUrl =
  "https://maps.app.goo.gl/GqQA6GFTDJDQSVzF7?g_st=ic";

export function whatsappUrl(message: string) {
  return `https://wa.me/639752984845?text=${encodeURIComponent(message)}`;
}

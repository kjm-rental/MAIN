import { BookingPage } from "@/components/website/booking-page";
export const instant = false;
export default async function BookRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BookingPage selectedSlug={slug} />;
}

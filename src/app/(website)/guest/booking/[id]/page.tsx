import { notFound } from "next/navigation";
import { z } from "zod";
import { GuestBookingStatus } from "@/components/website/guest-booking-status";
export default async function GuestStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  return (
    <main className="bg-sand px-5">
      <GuestBookingStatus id={parsed.data} />
    </main>
  );
}

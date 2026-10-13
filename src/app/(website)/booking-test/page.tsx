import { notFound } from "next/navigation";
import { BookingTestSignIn } from "@/components/website/booking-test-sign-in";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Restricted Booking Test" };

export default function BookingTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const localSession = process.env.KJM_PAYMONGO_TEST === "true";
  return (
    <main className="bg-off-white min-h-svh py-16">
      <Container>
        <section className="border-deep-teal/10 mx-auto max-w-xl rounded-[2rem] border bg-white p-7 shadow-sm sm:p-10">
          <p className="text-ocean text-xs font-extrabold tracking-wider uppercase">
            {localSession
              ? "Local owner testing"
              : "Restricted synthetic testing"}
          </p>
          <h1 className="text-deep-teal mt-2 text-3xl font-bold">
            Booking test sign-in
          </h1>
          <p className="text-muted mt-4 text-sm leading-7">
            {localSession
              ? "Use the authorized existing TEST account to explore the original booking journey. Bookings, uploaded documents and payment simulations stay in Supabase TEST. Document review and pickup safeguards still apply."
              : "Only a dedicated existing account with an unexpired administrator authorization can enter. Use synthetic names, .invalid email addresses, and documents visibly labelled SYNTHETIC TEST DOCUMENT."}
          </p>
          <BookingTestSignIn localSession={localSession} />
        </section>
      </Container>
    </main>
  );
}

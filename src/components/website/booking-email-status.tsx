"use client";
export function BookingEmailStatus({ bookingId }: { bookingId: string }) {
  return (
    <p className="bg-sand/40 mt-5 rounded-xl p-4 text-sm">
      Your booking update will be sent to the email address you entered. Check
      your inbox and spam folder. Keep reference{" "}
      {bookingId ? "above" : "with you"} when contacting KJM.
    </p>
  );
}

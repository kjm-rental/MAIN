/** Static replies only. No lookup, account linking, or customer data is permitted here. */
export function telegramCommandReply(text: string) {
  const command = /^\/(start|mybookings)(?:@KJMRentalBot)?(?:\s|$)/i
    .exec(text)?.[1]
    ?.toLowerCase();
  if (command === "start") {
    return "Welcome to KJM Motorcycle Rental! 🏍️\n\nThis is @KJMRentalBot, your private owner notification bot. Booking alerts are delivered here when the notification worker is configured and enabled.\n\nUse KJM ADMIN to manage bookings and review documents. Bot commands never display customer or booking details.";
  }
  if (command === "mybookings") {
    return "Booking data is not available yet through bot commands. This bot is for the authorized KJM owner only.\n\nOpen KJM ADMIN to view and manage bookings. No customer account linking or booking lookup is performed here. Please do not send passwords, ID photos, or document numbers to this bot.";
  }
  return null;
}

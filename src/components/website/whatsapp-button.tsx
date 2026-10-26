import { businessContact, whatsappUrl } from "@/lib/content/business-contact";

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.52 3.48A11.9 11.9 0 0 0 12.05 0C5.47 0 .11 5.35.1 11.94c0 2.1.55 4.16 1.6 5.97L0 24l6.24-1.64a11.94 11.94 0 0 0 5.8 1.48h.01c6.58 0 11.94-5.35 11.95-11.94a11.87 11.87 0 0 0-3.48-8.42ZM12.05 21.82a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.7.97.99-3.61-.24-.37a9.87 9.87 0 0 1-1.52-5.28c0-5.47 4.46-9.92 9.94-9.92a9.86 9.86 0 0 1 7.03 2.91 9.86 9.86 0 0 1 2.9 7.02c0 5.48-4.46 9.93-10 9.93Zm5.45-7.43c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.8-1.49-1.78-1.66-2.08-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.3 1.27.49 1.7.62.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

export function FloatingWhatsAppButton() {
  return (
    <a
      style={{
        position: "fixed",
        right: "calc(1.25rem + env(safe-area-inset-right, 0px))",
        bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
        zIndex: 40,
      }}
      href={whatsappUrl(
        "Hello KJM Motorcycle Rental! I would like to inquire about your motorcycle rental services.",
      )}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with KJM Motorcycle Rental on WhatsApp"
      title={`Chat with ${businessContact.name} on WhatsApp`}
      className="kjm-whatsapp-float fixed z-40 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_6px_24px_rgba(0,0,0,.22)] transition-transform focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#128C7E] motion-safe:hover:-translate-y-1"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}

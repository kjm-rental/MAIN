import Link from "next/link";
import Image from "next/image";
import { FloatingWhatsAppButton } from "@/components/website/whatsapp-button";
export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="minimal-booking-shell">
      <header className="minimal-booking-header">
        <Link href="/" aria-label="KJM Motorcycle Rental home">
          <Image
            src="/images/brand/kjm-logo.png"
            width={36}
            height={42}
            alt="KJM"
          />
          <span>
            KJM<span className="minimal-brand-dot">.</span>
            <small>Motorcycle Rental</small>
          </span>
        </Link>
        <Link href="/motorcycles">Our motorcycles</Link>
      </header>
      {children}
      <FloatingWhatsAppButton />
    </div>
  );
}

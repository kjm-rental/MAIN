import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KJM Motorcycle Rental | Lapu-Lapu, Cebu",
    template: "%s | KJM Motorcycle Rental",
  },
  description:
    "Explore Mactan Island and Cebu with KJM Motorcycle Rental in Lapu-Lapu City. Browse motorcycles, rental rates, and the booking request process.",
  applicationName: "KJM Motorcycle Rental",
  keywords: ["motorcycle rental", "Lapu-Lapu City", "Mactan Island", "Cebu"],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${jakarta.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

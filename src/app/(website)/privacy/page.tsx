import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/page-hero";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How KJM Motorcycle Rental handles customer information, verification documents, bookings, and payment records.",
  robots: { index: false, follow: false },
};

const sections = [
  {
    id: "about",
    title: "Who we are and what this policy covers",
    paragraphs: [
      "KJM Motorcycle Rental, based in Lapu-Lapu City, Cebu, Philippines, determines how customer information is used for its rental services and acts as the personal information controller for those activities. This policy covers the website, customer and booking records, identity verification, rental administration, and related communications.",
      "We aim to handle personal data transparently, for specified rental and service purposes, and in proportion to those purposes, in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), its implementing rules, and applicable National Privacy Commission issuances. This policy describes the current website implementation; it is not a certification of compliance.",
    ],
  },
  {
    id: "customer-information",
    title: "Registration, sessions, and booking information",
    paragraphs: [
      "When you submit a booking, we collect your full legal name, email address, phone number, country, and whether you are a Philippine resident or an international visitor. We associate these details with a customer record, an authentication identifier, and your booking. The current public flow supports a guest authentication session; it does not require a separate public account registration form.",
      "Where a password-based account is provided, Supabase Authentication processes sign-in credentials and session information. The current password sign-in screen is for authorized booking testers. Booking records also include your selected motorcycle, pickup and return dates and times, rental duration, extras and quantities, quoted charges, booking reference and status, terms acceptance, and verification consent records.",
    ],
  },
  {
    id: "verification",
    title: "Identity documents and driving eligibility",
    paragraphs: [
      "The booking flow requests a government-issued identity document for Philippine residents or a passport for international visitors, the front of your driver’s license, an optional license back, and an International Driving Permit where applicable. We also collect the names on your identity document and license, license issuing country and expiry date, permitted vehicle categories, and, for international visitors, your Philippines entry date.",
      "Uploaded copies can contain additional information such as your photograph, signature, document number, date of birth, address, and nationality. Government-issued identifiers and other information appearing on these documents may be sensitive personal information under Philippine law. Submit only the requested documents and avoid including unrelated information or another person’s documents.",
      "We use the documents to check identity, consistency of submitted details, document validity, and driving eligibility. The website includes server-side optical character recognition (OCR) and automated screening of supported images. This screening is advisory; KJM staff must review and approve verification. We also keep document metadata, verification status, review notes, and resubmission history. Automated screening alone does not authorize motorcycle release.",
    ],
  },
  {
    id: "rental-communications",
    title: "Rental history and customer communications",
    paragraphs: [
      "We maintain booking and status history, customer requests, verification decisions, and relevant communications about availability, pickup, return, cancellations, rescheduling, payments, refunds, or disputes. Information you give KJM through a contact channel may be added to your rental record when needed to handle your request.",
      "Rental administration can also involve handover and return inspection records, mileage, fuel levels, accessories, condition and damage notes, charges, and deposit events. These records help us administer the rental and explain any outstanding amounts or deductions.",
    ],
  },
  {
    id: "payments",
    title: "PayMongo, refunds, and the security deposit",
    paragraphs: [
      "Cash on Pickup is currently the only rental payment option. The refundable ₱2,500 cash security deposit is collected separately at pickup. Online payments remain disabled until KJM explicitly authorizes activation. If online payments are enabled in the future, rental payments will be processed through PayMongo’s hosted checkout. KJM sends the rental amount, currency, a transaction reference, and return URLs to create checkout. Payment details you enter there are handled by PayMongo and the payment method provider. KJM’s website does not collect card numbers, CVVs, or online banking passwords through its own booking form.",
      "We keep records needed to match a payment to a booking, including checkout and payment identifiers, amounts, currency, transaction status, timestamps, and payment or refund references. KJM may also record payment adjustments, refund amounts, reasons, and relevant customer communications. Refund processing may require you to provide recipient or payment-channel details through an approved channel; do not send passwords or payment security codes.",
      "The rental terms provide for a ₱2,500 refundable security deposit, or another amount specified in the booking confirmation. Deposit collection, return, deductions, and disputes are recorded separately from rental payments. This policy does not imply that the deposit is automatically charged or refunded by PayMongo. Deposit and refund conditions follow the applicable rental agreement.",
      "Owner confirmation required: confirm the deposit collection and return channels, refund handling procedure, and whether any original identity document is ever held. An administrative feature for recording ID receipt and return does not establish an approved or lawful practice of retaining original IDs.",
    ],
  },
  {
    id: "purposes-bases",
    title: "Why we use information and our legal bases",
    paragraphs: [
      "For ordinary personal information, processing needed to respond to your booking request and perform the rental agreement can rely on the contract basis in Section 12 of RA 10173. Necessary accounting and legally required records may rely on an applicable legal obligation. Proportionate fraud prevention, website protection, and dispute administration may rely on legitimate interests after considering your rights. Consent applies where required for a specific activity.",
      "Sensitive personal information, including government-issued identifiers, requires a separate applicable condition under Section 13. The booking flow asks for consent to verification processing. KJM must confirm before launch that this consent is specific, informed, and obtained before sensitive data is processed, or identify another applicable Section 13 exception. A rental contract or general legitimate interest alone is not sufficient for sensitive information.",
      "We use the information described above to assess rental eligibility, manage reservations and rentals, communicate with you, reconcile payments, administer deposits and refunds, protect the service, and handle complaints or legal claims. If required verification information is not provided, we may be unable to approve or release a motorcycle. Any additional purpose requiring consent must be explained separately.",
    ],
  },
  {
    id: "storage-security",
    title: "Storage, hosting, and access controls",
    paragraphs: [
      "The implementation uses Supabase for authentication, customer and booking data, and uploaded document storage. Identity-verification documents are configured in a private storage bucket. Database and storage access policies restrict customer access to associated records and document access to their owner and authorized administrators. The admin document viewer uses temporary signed links.",
      "Website servers process booking requests and document screening, and hosting infrastructure may process technical request data such as IP addresses, browser details, timestamps, and error or security logs. Access to customer records should be limited to authorized personnel and service providers who need it for their assigned work. No internet service can promise absolute security.",
      "Owner confirmation required: verify the production hosting provider, Supabase region, deployed access controls, staff permissions, backup arrangements, incident procedures, and operational safeguards. The controls described here reflect repository configuration, not an audit of the live service.",
    ],
  },
  {
    id: "providers",
    title: "Service providers and other disclosures",
    paragraphs: [
      "Service providers process information needed for their role: Supabase for authentication, database and file storage; PayMongo and payment-channel providers for checkout and payment handling when online payments are enabled; Cloudflare Turnstile for anti-bot checks; and the confirmed website hosting provider for serving and operating the website.",
      "The admin implementation also supports owner alerts through Telegram. When configured and enabled, these can include customer name and phone number, booking reference, motorcycle, rental dates, total, and payment or verification status. Document images are reviewed through the admin system rather than attached to those alerts. Email notification tooling includes Resend test support; its use for production customer messages must be confirmed before it is described as a live service.",
      "Information may also be disclosed where required by law or necessary for a properly supported legal claim, to the relevant authorities or professional advisers. Disclosures should be limited to information needed for the purpose. Owner confirmation required: approve the live provider list, notification channels, recipients, and the agreements governing their processing.",
    ],
  },
  {
    id: "international",
    title: "International data processing",
    paragraphs: [
      "Cloud service providers may process or store data outside the Philippines, depending on the selected service region, support arrangements, and provider infrastructure. This can include hosting, authentication, payment, anti-bot, or notification processing. We do not assert that all customer information stays in the Philippines.",
      "KJM remains accountable for personal information under its control when processing is outsourced. Owner confirmation required: identify the actual storage and processing locations and confirm appropriate contractual and other safeguards for overseas processing before launch. No specific transfer mechanism or protection level is represented as already verified.",
    ],
  },
  {
    id: "retention",
    title: "Retention and deletion",
    paragraphs: [
      "Information should be kept only as long as necessary for its stated purpose, applicable legal requirements, or the establishment, exercise, or defense of legal claims. Identity documents should be assessed separately from booking, accounting, payment, and dispute records; they should not automatically be kept for the same period.",
      "Owner confirmation required: KJM has not supplied a confirmed retention schedule. Before launch, approve periods or clear criteria for customer and session records, bookings, uploaded and replaced documents, verification reviews, payments, refunds, deposits, communications, logs, and backups, together with a secure deletion process and responsible person. This policy does not promise automatic deletion or a fixed retention period.",
      "You may request deletion or blocking, subject to applicable conditions. Some records may need to be retained for legal obligations or unresolved claims. Deleting a login or session does not itself confirm deletion of associated booking records, document copies, or provider backups. KJM should explain any records retained and the basis for retaining them when responding to a request.",
    ],
  },
  {
    id: "rights",
    title: "Your privacy rights",
    paragraphs: [
      "Subject to the conditions and exceptions in Philippine law, you may ask to be informed about processing, access your personal data, correct inaccurate information, object to processing, or request erasure or blocking. You may withdraw consent for processing based on consent and request data portability where applicable. Withdrawal may affect services requiring that information and does not automatically remove records retained on another lawful basis.",
      "You may also seek damages where legally available and file a complaint with the National Privacy Commission. To make a request, use KJM’s verified privacy contact once supplied and describe the information or processing concerned. KJM may need proportionate proof of identity to protect your records; avoid sending a full ID copy in an initial inquiry. No unconfirmed response deadline is promised here.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies, authentication, and website security",
    paragraphs: [
      "Supabase authentication uses cookies and session information to maintain sign-in or guest sessions and authorize requests. These are used to operate the booking service. Blocking or clearing them may interrupt a booking or prevent access to a session’s records.",
      "The guest booking flow uses Cloudflare Turnstile to help prevent automated abuse. It processes challenge tokens and technical browser or network signals under Cloudflare’s own privacy practices. Hosting and authentication providers may also process technical information to operate and protect their services.",
      "No advertising or analytics integration was identified in the reviewed website code. Owner confirmation required: check the production website and any hosting-added scripts or cookies before launch. If optional tracking is introduced, explain its purpose and choices and obtain consent where required before enabling it.",
    ],
  },
  {
    id: "children",
    title: "Children’s privacy",
    paragraphs: [
      "The website is intended for customers seeking a motorcycle rental and meeting applicable licensing and rental eligibility requirements. It is not directed at children. Do not submit a child’s personal information unless KJM has explained a necessary, lawful purpose and any required consent arrangements. If you believe a child’s information was submitted without proper authority, contact KJM so the record can be reviewed and appropriately handled.",
    ],
  },
  {
    id: "updates-contact",
    title: "Policy updates and privacy contact",
    paragraphs: [
      "Updates will appear on this page with a revision date. Material changes to purposes or processing should be brought to affected customers’ attention, with fresh consent where required. Review version: October 13, 2026. The effective date will be set after owner approval.",
      "Personal information controller: KJM Motorcycle Rental, Lapu-Lapu City, Cebu, Philippines. Owner confirmation required: supply the privacy contact or designated privacy officer, monitored email address, approved phone number, and business mailing address before launch. The current Contact page also awaits verified details and is not yet a working privacy request channel.",
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <main>
      <PageHero
        eyebrow="KJM Motorcycle Rental · Your information"
        title="Privacy Policy"
        description="How we handle your information when you book, verify your identity, pay, and rent a motorcycle with KJM in Lapu-Lapu City, Cebu."
      />
      <section className="bg-sand pb-16 sm:pb-24">
        <Container>
          <div className="border-ocean/20 bg-off-white mb-8 rounded-2xl border p-5 sm:p-7">
            <p className="text-ocean text-xs font-bold tracking-widest uppercase">
              Prepared for Kirstine’s review
            </p>
            <p className="text-deep-teal mt-3 leading-7">
              Review version · October 13, 2026. Owner approval and the marked
              confirmations are required before this policy takes effect. No
              effective date has been assigned.
            </p>
          </div>
          <div className="grid items-start gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <nav
              aria-label="Privacy policy contents"
              className="border-deep-teal/10 bg-off-white rounded-2xl border p-5 sm:p-7"
            >
              <h2 className="text-deep-teal text-lg font-bold">
                In this policy
              </h2>
              <ol className="mt-4 space-y-1">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-muted hover:text-ocean focus-visible:outline-ocean flex gap-3 rounded-md py-2 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      <span className="text-ocean w-5 shrink-0 font-semibold">
                        {index + 1}.
                      </span>
                      <span>{section.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <article
              aria-label="Privacy policy"
              className="border-deep-teal/10 bg-off-white min-w-0 rounded-[1.5rem] border px-5 sm:px-8 lg:px-10"
            >
              {sections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-heading`}
                  className="border-deep-teal/10 scroll-mt-28 border-b py-8 last:border-b-0 sm:py-10"
                >
                  <h2
                    id={`${section.id}-heading`}
                    className="text-deep-teal text-xl leading-snug font-bold tracking-tight sm:text-2xl"
                  >
                    <span className="text-ocean">{index + 1}.</span>{" "}
                    {section.title}
                  </h2>
                  <div className="text-muted mt-5 space-y-4 text-base leading-7 break-words">
                    {section.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className={
                          paragraph.startsWith("Owner confirmation required:")
                            ? "border-ocean/20 bg-sand rounded-xl border p-4 text-sm leading-6"
                            : undefined
                        }
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
              <div className="border-deep-teal/10 border-t py-7 text-sm leading-6">
                <p className="text-muted">Related information</p>
                <div className="text-ocean mt-3 flex flex-wrap gap-x-6 gap-y-3 font-semibold">
                  <Link href="/terms" className="underline underline-offset-4">
                    Rental terms
                  </Link>
                  <Link
                    href="/contact"
                    className="underline underline-offset-4"
                  >
                    KJM contact page
                  </Link>
                  <a
                    href="https://privacy.gov.ph/data-privacy-act-/"
                    className="underline underline-offset-4"
                  >
                    Data Privacy Act of 2012
                  </a>
                  <a
                    href="https://privacy.gov.ph/data-subject-rights/"
                    className="underline underline-offset-4"
                  >
                    NPC privacy rights
                  </a>
                </div>
              </div>
            </article>
          </div>
        </Container>
      </section>
    </main>
  );
}

"use client";
import { customerFieldErrors } from "@/lib/guest-checkout/validation";
import { rentalDuration } from "@/lib/rental-duration";
import { DeliveryChoice } from "@/components/website/delivery-choice";
import {
  selfService,
  type ServiceConfig,
  type ServiceSelection,
  type ServiceQuote,
} from "@/lib/delivery/schema";
import { authoritativeRentalQuote } from "@/lib/authoritative-rental-quote";
import { CheckoutSummary } from "@/components/website/checkout-summary";
import type { RentalPricing } from "@/lib/rental-pricing";
import { BookingEmailStatus } from "./booking-email-status";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookingDocumentUpload as Upload } from "./booking-document-upload";
import { documentFileError } from "@/lib/booking-document-file";
import { TermsAcceptance } from "@/components/website/terms-acceptance";
import {
  assertBookingAcceptance,
  hasRequiredBookingAcceptance,
} from "@/lib/terms-acceptance-policy";
import Image from "next/image";
import { MotorcycleVisual } from "@/components/website/motorcycle-visual";
import "./booking-wizard.css";
import { availabilityErrorMessage } from "@/lib/availability-error";
import { BookingDateStage } from "./booking-date-stage";
import {
  initialBookingStep,
  formatBookingDate,
} from "@/lib/booking-presentation";
import {
  ArrowLeft,
  ArrowRight,
  FileCheck2,
  LoaderCircle,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateRentalPeriod } from "@/lib/booking";
import { SecurityDepositChoice } from "@/components/website/security-deposit-choice";
import type { DepositOptions } from "@/lib/security-deposits";
import { formatPhp, formatCentavos } from "@/lib/currency";
import { TurnstileChallenge } from "@/components/website/turnstile-challenge";
import type { Json } from "@/types/database";
import type { MotorcycleModel } from "@/types/motorcycle";
import { customerOnlinePaymentsEnabled } from "@/lib/payment-availability";
import { PaymentMethodChoice } from "./payment-method-choice";

type Settings = {
  timezone: string;
  operating_hours: Json | null;
  partial_day_policy: string | null;
  partial_day_pricing_policy: string | null;
  pending_expiration_minutes: number | null;
  accepted_philippine_id_types: Json;
  philippine_license_policy: string | null;
  international_license_policy: string | null;
  international_manual_review_required: boolean;
  international_policy_source_url: string | null;
  international_policy_verified_at: string | null;
  privacy_notice: string | null;
  public_booking_enabled: boolean;
  policies_approved_at: string | null;
};
type Form = {
  pickup: string;
  returnAt: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  customerType: "philippine_resident" | "international_visitor";
  identityName: string;
  licenseName: string;
  licenseCountry: string;
  licenseExpiration: string;
  vehicleCategories: string;
  entryDate: string;
};
const initial: Form = {
  pickup: "",
  returnAt: "",
  fullName: "",
  email: "",
  phone: "",
  country: "",
  customerType: "philippine_resident",
  identityName: "",
  licenseName: "",
  licenseCountry: "Philippines",
  licenseExpiration: "",
  vehicleCategories: "",
  entryDate: "",
};
type BookingExtra = {
  id: string;
  name: string;
  description: string | null;
  price_php: number;
  price_centavos: number;
  pricing_model: string;
  total_quantity: number;
  max_per_booking: number;
  image_path: string | null;
};
const steps = [
  "Choose Motorcycle",
  "Dates & Times",
  "Your Details",
  "Upload Documents",
  "Review & Confirm",
];
export function BookingCheckout({
  motorcycle: initialMotorcycle,
  motorcycles,
  preselected = false,
  settings,
  configured,
  submissionEnabled = configured,
  paymentTestMode = false,
  extras,
  depositOptions,
}: {
  motorcycle: MotorcycleModel;
  motorcycles: readonly MotorcycleModel[];
  preselected?: boolean;
  settings: Settings | null;
  configured: boolean;
  submissionEnabled?: boolean;
  paymentTestMode?: boolean;
  extras: BookingExtra[];
  depositOptions: DepositOptions | null;
}) {
  const router = useRouter();
  const [selectedPaymentMethod, setPaymentMethod] = useState<"cash" | "online">(
    "cash",
  );

  const [serviceConfig, setServiceConfig] = useState<ServiceConfig | null>(
    null,
  );
  const [services, setServices] = useState<ServiceSelection>(selfService);
  const [serviceQuote, setServiceQuote] = useState<ServiceQuote | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/delivery/options", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((c) => {
        if (active) {
          setServiceConfig(c);
          if (!c.cash_enabled && c.qrph_enabled && c.qrph_ready)
            setPaymentMethod("online");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  async function quoteServices(start: string, end: string) {
    if (!serviceConfig)
      throw Error(
        "Service options are temporarily unavailable. Please refresh or contact KJM.",
      );
    if (!services.delivery && !services.collection) {
      const result = {
        deliveryFeeCentavos: 0,
        collectionFeeCentavos: 0,
        totalCentavos: 0,
      };
      setServiceQuote(result);
      return result;
    }
    const r = await fetch("/api/delivery/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection: services, start, end }),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error);
    setServiceQuote(result);
    return result as ServiceQuote;
  }

  const documentDetails = useRef<HTMLDetailsElement>(null);
  const stepBody = useRef<HTMLDivElement>(null);
  const [motorcycle, setMotorcycle] = useState(initialMotorcycle);
  const [step, setStep] = useState(() => initialBookingStep(preselected)),
    [form, setForm] = useState(initial),
    [files, setFiles] = useState<Record<string, File | undefined>>({}),
    [busy, setBusy] = useState(false),
    [consented, setConsented] = useState(false),
    [error, setError] = useState(""),
    [bookingId, setBookingId] = useState(""),
    [reference, setReference] = useState(""),
    [captchaToken, setCaptchaToken] = useState(""),
    [extraQuantities, setExtraQuantities] = useState<Record<string, number>>(
      {},
    ),
    [quote, setQuote] = useState<{
      rental_pricing?: RentalPricing;
      pricing_units: number;
      daily_rate_php: number;
      base_total_centavos: number;
      extras_total_centavos: number;
      fees_total_centavos: number;
      deposit_required_centavos: number | null;
      total_centavos: number;
      policy_version?: string;
      cash_due_at_pickup_centavos?: number;
    } | null>(null);
  const quotedPayable = quote
    ? quote.total_centavos +
      (bookingId ? 0 : (serviceQuote?.totalCentavos ?? 0))
    : 0;
  const [acceptedTermsVersion, setAcceptedTermsVersion] = useState<
    string | null
  >(null);
  const [uploadProgress, setUploadProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reservationStatus, setReservationStatus] = useState("");
  const [draftBookingId, setDraftBookingId] = useState("");
  const paymentMethod = customerOnlinePaymentsEnabled
    ? selectedPaymentMethod
    : "cash";
  const [onlineMethods, setOnlineMethods] = useState<("card" | "qrph")[]>([]);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const onlinePaymentKey = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!customerOnlinePaymentsEnabled) return;
    let active = true;
    void fetch("/api/paymongo/methods", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && Array.isArray(data.methods)) {
          setOnlineMethods(
            data.methods.filter(
              (method: unknown) => method === "card" || method === "qrph",
            ),
          );
          setOnlineEnabled(data.onlineEnabled === true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  async function payOnline(id: string) {
    if (!customerOnlinePaymentsEnabled || !onlineEnabled) {
      setPaymentMessage("Online checkout is not available yet.");
      return;
    }
    setBusy(true);
    setPaymentMessage("");
    try {
      const response = await fetch(`/api/guest/bookings/${id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: id,
          idempotencyKey: onlinePaymentKey.current,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          "Online checkout is unavailable. Your reservation is saved; please try again later.",
        );
      if (typeof result.checkoutUrl === "string") {
        const destination = new URL(result.checkoutUrl);
        if (
          destination.protocol !== "https:" ||
          destination.hostname !== "checkout.paymongo.com" ||
          destination.port ||
          destination.username ||
          destination.password
        )
          throw new Error("Secure checkout is unavailable.");
        window.location.assign(destination.href);
      } else
        setPaymentMessage(
          result.status === "paid"
            ? "Payment verified. View your booking for details."
            : "Your payment is awaiting verification. Please check your booking status.",
        );
    } catch (e) {
      setPaymentMessage(
        e instanceof Error ? e.message : "Online checkout is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  const [depositOption, setDepositOption] = useState(() =>
    depositOptions?.cash_enabled ? "cash" : "",
  );
  const [depositDocument, setDepositDocument] = useState("");
  const submissionPending = useRef(false);
  const documentProgress = useRef(
    new Map<string, { file: File; path: string; uploaded: boolean }>(),
  );
  const idempotencyKey = useRef(crypto.randomUUID());
  const dates = useMemo(() => {
    try {
      return validateRentalPeriod(form.pickup, form.returnAt);
    } catch {
      return null;
    }
  }, [form.pickup, form.returnAt]);
  useEffect(() => {
    stepBody.current?.scrollTo(0, 0);
  }, [step]);
  const durationLabel = dates
    ? (rentalDuration(dates.startAt, dates.endAt)?.label ?? "Choose your dates")
    : "Choose your dates";
  const selectedExtras = extras.filter(
    (extra) => (extraQuantities[extra.id] ?? 0) > 0,
  );
  const extraItems = selectedExtras.map((extra) => ({
    id: extra.id,
    quantity: extraQuantities[extra.id],
  }));
  const update = (key: keyof Form, value: string) => {
    if (key === "pickup" || key === "returnAt") setQuote(null);
    setForm((v) => ({ ...v, [key]: value }));
    setFieldErrors((v) => ({ ...v, [key]: "" }));
  };
  async function authoritativeQuote(
    startAt: string,
    endAt: string,
    withDeposit: boolean,
  ) {
    const result = await authoritativeRentalQuote(
      createClient(),
      {
        p_model_id: motorcycle.id!,
        p_start_at: startAt,
        p_end_at: endAt,
        p_extra_items: extraItems,
      },
      withDeposit
        ? {
            option: depositOption!,
            document: depositOption === "eligible_id" ? depositDocument : null,
          }
        : undefined,
    );
    return {
      data: result.data as unknown as NonNullable<typeof quote>[] | null,
      error: result.error,
    };
  }
  useEffect(() => {
    if (!dates || !motorcycle.id || step !== 1) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void authoritativeRentalQuote(createClient(), {
        p_model_id: motorcycle.id!,
        p_start_at: dates.startAt,
        p_end_at: dates.endAt,
        p_extra_items: [],
      })
        .then((result) => {
          if (cancelled) return;
          if (result.error || !result.data?.[0]) {
            setQuote(null);
            setError(
              "We couldn’t calculate this price. Please check your dates and try again.",
            );
          } else {
            setQuote(result.data[0] as unknown as NonNullable<typeof quote>);
            setError("");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setQuote(null);
            setError("Server price unavailable. Try again.");
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dates, motorcycle.id, step]);
  async function next() {
    if (submissionPending.current) return;
    submissionPending.current = true;
    setError("");
    setBusy(true);
    try {
      if (step > 0 && !configured)
        throw new Error(
          "Online booking is not open yet. Please contact KJM to plan your ride.",
        );
      if (step === 1) {
        const period = validateRentalPeriod(form.pickup, form.returnAt);
        if (!motorcycle.id)
          throw new Error("Motorcycle catalog identity is missing.");
        const client = createClient();
        const [availability, serverQuote] = await Promise.all([
          client.rpc("get_model_slot_availability", {
            p_model_id: motorcycle.id,
            p_periods: [
              {
                key: "selected",
                start_at: period.startAt,
                end_at: period.endAt,
              },
            ],
          }),
          authoritativeQuote(period.startAt, period.endAt, false),
        ]);
        if (availability.error)
          throw new Error(availabilityErrorMessage(availability.error));
        if ((availability.data?.[0]?.available_count ?? 0) < 1)
          throw new Error("No physical unit is available for those dates.");
        if (serverQuote.error || !serverQuote.data?.[0])
          throw new Error(
            "We couldn’t calculate this rental price. Please check your dates and try again.",
          );
        setQuote(serverQuote.data[0]);
      }
      if (step === 2) {
        if (dates) await quoteServices(dates.startAt, dates.endAt);
        const errors = customerFieldErrors(form);
        setFieldErrors(errors);
        if (Object.keys(errors).length) {
          setError("Please check the highlighted details.");
          return;
        }
      }
      if (step === 3) {
        for (const file of Object.values(files)) {
          if (file) {
            const issue = documentFileError(file);
            if (issue) throw new Error(issue);
          }
        }
        if (
          !files.drivers_license_front ||
          !(form.customerType === "international_visitor"
            ? files.passport
            : files.government_id)
        )
          throw new Error(
            "Upload the required identity and driver's license documents.",
          );
        if (
          !form.licenseExpiration ||
          !form.identityName ||
          !form.licenseName ||
          !form.vehicleCategories
        ) {
          documentDetails.current?.setAttribute("open", "");
          throw new Error("Complete the required document information below.");
        }
      }
      if (step === 3) {
        if (
          !dates ||
          !depositOption ||
          (depositOption === "eligible_id" && !depositDocument)
        )
          throw new Error("Choose an approved security deposit arrangement.");
        await quoteServices(dates.startAt, dates.endAt);
        const result = await authoritativeQuote(
          dates.startAt,
          dates.endAt,
          true,
        );
        if (result.error || !result.data?.[0])
          throw new Error(
            "We couldn’t verify this price. Please check your dates and deposit choice.",
          );
        setQuote(result.data[0]);
      }
      setStep((v) => Math.min(4, v + 1));
    } catch (e) {
      setError(friendlyCheckoutError(e));
    } finally {
      submissionPending.current = false;
      setBusy(false);
    }
  }
  async function resetRentalDates() {
    if (busy) return;
    setBusy(true);
    try {
      if (draftBookingId) {
        const response = await fetch(`/api/guest/bookings/${draftBookingId}`, {
          method: "DELETE",
        });
        if (!response.ok)
          throw new Error(
            "The unfinished request could not be reset. Please contact KJM.",
          );
      }
      idempotencyKey.current = crypto.randomUUID();
      documentProgress.current.clear();
      setDraftBookingId("");
      setQuote(null);
      setStep(1);
      setError("");
      setForm((v) => ({ ...v, pickup: "", returnAt: "" }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The unfinished request could not be reset.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!configured || !submissionEnabled) {
      setError(
        "Reservation submission is unavailable. You can review your booking details without creating a reservation.",
      );
      return;
    }
    if (submissionPending.current || !dates || !motorcycle.id) return;
    if (!quote?.policy_version || !depositOption) {
      setError("Obtain a current server quote for your deposit arrangement.");
      return;
    }
    try {
      assertBookingAcceptance(consented, acceptedTermsVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept the required terms.");
      return;
    }
    submissionPending.current = true;
    setBusy(true);
    setError("");
    try {
      for (const file of Object.values(files)) {
        if (
          file &&
          (file.size > 8_388_608 ||
            ![
              "image/avif",
              "image/webp",
              "image/jpeg",
              "image/png",
              "application/pdf",
            ].includes(file.type))
        )
          throw new Error(
            "Use a supported verification document no larger than 8 MB.",
          );
      }

      if (
        !serviceQuote ||
        ((services.delivery || services.collection) && !serviceConfig?.enabled)
      )
        throw Error(
          "Review the delivery and collection quote before submitting.",
        );
      const response = await fetch("/api/guest/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_services: services,
          p_expected_service_centavos: serviceQuote.totalCentavos,
          p_expected_delivery_centavos: serviceQuote.deliveryFeeCentavos,
          p_expected_collection_centavos: serviceQuote.collectionFeeCentavos,
          p_payment_method: paymentMethod === "online" ? "qrph" : "cash",
          p_idempotency_key: idempotencyKey.current,
          p_model_id: motorcycle.id,
          p_start_at: dates.startAt,
          p_end_at: dates.endAt,
          p_extra_items: extraItems,
          p_full_name: form.fullName,
          p_email: form.email,
          p_phone: form.phone,
          p_country: form.country,
          p_customer_type: form.customerType,
          p_identity_name: form.identityName,
          p_license_name: form.licenseName,
          p_license_country: form.licenseCountry,
          p_license_expiration: form.licenseExpiration,
          p_vehicle_categories: form.vehicleCategories,
          p_entry_date: form.entryDate || null,
          p_privacy_consent: true,
          p_declaration: true,
          p_deposit_option: depositOption,
          p_policy_version: quote.policy_version,
          p_document_type:
            depositOption === "eligible_id" ? depositDocument : null,
          captchaToken,
        }),
      });
      const booking = await response.json();
      if (!response.ok) {
        if (booking.fields) setFieldErrors(booking.fields);
        throw new Error(
          "We couldn’t save your request. Please check your details, complete the security check again, and retry.",
        );
      }
      setDraftBookingId(booking.booking_id);
      setUploadProgress({
        completed: 0,
        total: Object.values(files).filter(Boolean).length,
      });
      for (const [kind, file] of Object.entries(files)) {
        if (!file) continue;
        if (
          file.size > 8_388_608 ||
          ![
            "image/avif",
            "image/webp",
            "image/jpeg",
            "image/png",
            "application/pdf",
          ].includes(file.type)
        )
          throw new Error(
            "A document has an unsupported format or exceeds 8 MB.",
          );
        const uploaded = documentProgress.current.get(kind);
        if (uploaded?.file === file && uploaded.uploaded) {
          setUploadProgress((v) => ({ ...v, completed: v.completed + 1 }));
          continue;
        }
        const uploadForm = new FormData();
        uploadForm.set("file", file);
        uploadForm.set("kind", kind);
        const upload = await fetch(
          `/api/guest/bookings/${booking.booking_id}/documents`,
          { method: "POST", body: uploadForm },
        );
        if (!upload.ok)
          throw new Error(
            "Your document could not be saved. Please try again or contact KJM.",
          );
        documentProgress.current.set(kind, { file, path: "", uploaded: true });
        setUploadProgress((v) => ({ ...v, completed: v.completed + 1 }));
      }
      const finalResponse = await fetch(
        `/api/guest/bookings/${booking.booking_id}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            termsVersion: acceptedTermsVersion!,
            accepted: true,
          }),
        },
      );
      const finalRecord = await finalResponse.json();
      if (!finalResponse.ok)
        throw new Error(
          "We couldn’t complete your request. Check your documents and dates, then retry. Your uploaded documents are preserved.",
        );
      // Advisory checks never delay or change a successfully saved reservation.
      void fetch(`/api/verification/${booking.booking_id}/prescreen`, {
        method: "POST",
        keepalive: true,
      }).catch(() => undefined);
      setReservationStatus(finalRecord.booking_status);
      setReference(booking.booking_reference);
      setBookingId(booking.booking_id);
      setQuote((current) =>
        current
          ? {
              ...current,
              total_centavos: booking.rental_total_centavos,
              deposit_required_centavos: booking.deposit_required_centavos,
              cash_due_at_pickup_centavos: booking.cash_due_at_pickup_centavos,
            }
          : current,
      );
      setStep(5);
      if (paymentMethod === "online") {
        if (finalRecord.booking_status === "confirmed")
          await payOnline(booking.booking_id);
        else
          setPaymentMessage(
            "Your booking requires approval before online payment is available.",
          );
      }
    } catch (e) {
      setError(friendlyCheckoutError(e));
    } finally {
      submissionPending.current = false;
      setBusy(false);
    }
  }
  const checkoutSummary = (
    <CheckoutSummary
      model={motorcycle.model}
      image={motorcycle.primaryImage}
      pickup={form.pickup ? formatBookingDate(form.pickup) : "Choose pickup"}
      returnAt={
        form.returnAt ? formatBookingDate(form.returnAt) : "Choose return"
      }
      duration={durationLabel}
      rentalCentavos={quote?.base_total_centavos ?? null}
      extrasCentavos={quote?.extras_total_centavos ?? 0}
      deliveryCentavos={serviceQuote?.deliveryFeeCentavos ?? 0}
      collectionCentavos={serviceQuote?.collectionFeeCentavos ?? 0}
      totalCentavos={quote ? quotedPayable : null}
      depositCentavos={quote?.deposit_required_centavos ?? null}
      online={paymentMethod === "online"}
      pricing={quote?.rental_pricing}
      servicesPending={
        !!(services.delivery || services.collection) && !serviceQuote
      }
    />
  );
  return (
    <div className="mx-auto max-w-6xl">
      <div className="minimal-progress">
        <div>
          <span>
            {step < 5 ? `Step ${step + 1} of 5` : "Reservation receipt"}
          </span>
          <strong>{step < 5 ? steps[step] : "Confirmation"}</strong>
        </div>
        <progress
          max={5}
          value={Math.min(step + 1, 5)}
          aria-label="Booking progress"
        />
      </div>
      <div className="minimal-booking-layout">
        <section className="minimal-booking-content">
          <div ref={stepBody} className="minimal-step-body">
            {!configured && (
              <div className="journey-launch-notice" role="status">
                <ShieldCheck size={18} />
                <div>
                  <strong>Plan your ride. Booking opens soon.</strong>
                  <p>
                    You can explore the booking interface. Reservations remain
                    closed while KJM completes launch preparations.
                  </p>
                </div>
              </div>
            )}
            {configured && !submissionEnabled && (
              <p role="status" className="journey-launch-notice">
                You can complete and review the form. Reservation submission is
                disabled for this local preview.
              </p>
            )}
            {paymentTestMode && customerOnlinePaymentsEnabled && (
              <p role="status" className="journey-launch-notice">
                Local TEST session. Use the payment simulator; do not scan or
                pay QR codes. No production booking or payment records are used.
              </p>
            )}
            {step === 0 && (
              <div>
                <Heading
                  title="Choose your motorcycle"
                  text="Find your ride for Cebu."
                />
                <div className="journey-showroom">
                  {motorcycles
                    .filter((ride) => ride.id)
                    .map((ride) => (
                      <button
                        key={ride.id}
                        type="button"
                        aria-pressed={motorcycle.id === ride.id}
                        disabled={busy || Boolean(draftBookingId)}
                        onClick={() => {
                          setMotorcycle(ride);
                          window.history.replaceState(
                            null,
                            "",
                            `/book/${ride.slug}`,
                          );
                          setQuote(null);
                          setError("");
                        }}
                        className={`overflow-hidden rounded-3xl border-2 text-left transition hover:-translate-y-1 ${motorcycle.id === ride.id ? "border-ocean bg-ocean/5 shadow-lg" : "border-deep-teal/10 bg-white"}`}
                      >
                        <MotorcycleVisual
                          model={ride.model}
                          media={ride.primaryImage}
                          compact
                        />
                        <div className="p-5">
                          <p className="text-ocean text-xs font-bold">
                            {motorcycle.id === ride.id
                              ? "Selected for your adventure"
                              : "Choose this motorcycle"}
                          </p>
                          <h2 className="text-deep-teal mt-2 text-xl font-bold">
                            {ride.model}
                          </h2>
                          <p className="text-muted mt-2 text-sm">
                            {[
                              ride.specifications.engineDisplacementCc
                                ? `${ride.specifications.engineDisplacementCc} cc`
                                : null,
                              ride.specifications.transmission,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <p className="text-muted mt-2 line-clamp-2 text-sm">
                            {ride.description}
                          </p>
                          <p className="text-ocean mt-4 text-xl font-extrabold">
                            {formatPhp(ride.dailyRatePhp)}
                            <span className="text-muted text-xs"> / day</span>
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
                {draftBookingId && (
                  <p className="text-muted mt-4 text-sm">
                    Reset rental dates to release your unfinished request before
                    changing motorcycles.
                  </p>
                )}
              </div>
            )}
            {step === 1 && (
              <div className="minimal-selected-ride">
                <div>
                  <strong>{motorcycle.model}</strong>
                  <span>{formatPhp(motorcycle.dailyRatePhp)} / day</span>
                </div>
                <button
                  type="button"
                  disabled={busy || Boolean(draftBookingId)}
                  onClick={() => {
                    setStep(0);
                    setError("");
                  }}
                >
                  Change Motorcycle
                </button>
              </div>
            )}
            {step === 1 && (
              <div>
                <Heading
                  title="Dates & Times"
                  text="Choose pickup and return. All times are in Asia/Manila."
                />
                <BookingDateStage
                  modelId={motorcycle.id!}
                  pickup={form.pickup}
                  returnAt={form.returnAt}
                  operatingHours={settings?.operating_hours}
                  onPickup={(value) => update("pickup", value)}
                  onReturn={(value) => update("returnAt", value)}
                />
                {dates && (
                  <div className="bg-ocean/5 border-ocean/15 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm">
                    <span className="font-bold">{durationLabel}</span>
                    <span className="text-ocean font-bold">
                      {quote
                        ? formatCentavos(quotedPayable)
                        : "Requesting server price…"}
                    </span>
                    <p className="text-muted w-full text-xs">
                      Your exact price, extras and deposit are verified before
                      review.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void resetRentalDates()}
                  className="text-ocean mt-3 text-xs font-bold underline"
                >
                  Reset rental dates
                </button>
                <p className="bg-sand/60 text-muted mt-5 rounded-xl p-4 text-sm">
                  Your dates use Philippine time. Your motorcycle is reserved
                  only after your booking is confirmed.
                </p>
              </div>
            )}
            {step === 1 && extras.length > 0 && (
              <div className="border-deep-teal/10 mt-8 border-t pt-8">
                <Heading
                  title="A few finishing touches."
                  text="Choose quantities or continue without extras. Per-day items are charged for each server-calculated rental day."
                />
                {extras.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {extras.map((extra) => {
                      const quantity = extraQuantities[extra.id] ?? 0;
                      const selected = quantity > 0;
                      return (
                        <article
                          key={extra.id}
                          className={`flex min-h-28 items-start justify-between gap-4 rounded-2xl border p-5 text-left transition ${selected ? "border-ocean bg-ocean/5 shadow-sm" : "border-deep-teal/10 hover:border-ocean/40"}`}
                        >
                          <span className="min-w-0">
                            {extra.image_path && (
                              <Image
                                src={
                                  createClient()
                                    .storage.from("booking-extras")
                                    .getPublicUrl(extra.image_path).data
                                    .publicUrl
                                }
                                alt={extra.name}
                                width={160}
                                height={100}
                                className="bg-sand mb-3 h-24 w-full rounded-xl object-contain"
                              />
                            )}
                            <span className="text-deep-teal block font-extrabold">
                              {extra.name}
                            </span>
                            {extra.description && (
                              <span className="text-muted mt-1 block text-xs leading-5">
                                {extra.description}
                              </span>
                            )}
                            <span className="text-ocean mt-3 block text-sm font-bold">
                              +{formatPhp(extra.price_php)}
                              {extra.pricing_model === "per_day"
                                ? " / rental day"
                                : " / rental"}
                            </span>
                          </span>
                          <span className="bg-sand flex shrink-0 items-center gap-2 rounded-full p-1">
                            <button
                              type="button"
                              aria-label={`Remove one ${extra.name}`}
                              disabled={!quantity}
                              onClick={() =>
                                setExtraQuantities((current) => ({
                                  ...current,
                                  [extra.id]: Math.max(0, quantity - 1),
                                }))
                              }
                              className="disabled:bg-sand disabled:text-muted flex size-11 items-center justify-center rounded-full bg-white font-bold disabled:opacity-100"
                            >
                              −
                            </button>
                            <span className="min-w-4 text-center text-sm font-extrabold">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`Add one ${extra.name}`}
                              disabled={
                                quantity >=
                                Math.min(
                                  extra.max_per_booking,
                                  extra.total_quantity,
                                )
                              }
                              onClick={() =>
                                setExtraQuantities((current) => ({
                                  ...current,
                                  [extra.id]: quantity + 1,
                                }))
                              }
                              className="bg-ocean disabled:bg-sand disabled:text-muted flex size-11 items-center justify-center rounded-full text-white disabled:opacity-100"
                            >
                              <Plus className="size-3" />
                            </button>
                          </span>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="bg-sand/60 text-muted rounded-2xl p-5 text-sm">
                    No extras are currently available. You can continue without
                    adding anything.
                  </p>
                )}
                <div className="bg-deep-teal mt-5 flex items-center justify-between rounded-2xl p-5 text-white">
                  <span className="text-sm font-bold">Selected extras</span>
                  <span className="text-xl font-extrabold">
                    {formatPhp(
                      selectedExtras.reduce(
                        (sum, item) =>
                          sum +
                          item.price_php *
                            extraQuantities[item.id] *
                            (item.pricing_model === "per_day"
                              ? Math.max(quote?.pricing_units ?? 1, 1)
                              : 1),
                        0,
                      ),
                    )}
                  </span>
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <Heading
                  title="Your Details"
                  text="Enter your details as they appear on your ID."
                />
                {serviceConfig && (
                  <DeliveryChoice
                    config={serviceConfig}
                    value={services}
                    onChange={(value) => {
                      setServices(value);
                      setServiceQuote(null);
                    }}
                  />
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Full legal name"
                    error={fieldErrors.fullName}
                    value={form.fullName}
                    onChange={(v) => update("fullName", v)}
                  />
                  <Input
                    label="Email"
                    type="email"
                    error={fieldErrors.email}
                    value={form.email}
                    onChange={(v) => update("email", v)}
                  />

                  <Input
                    label="Mobile number"
                    type="tel"
                    error={fieldErrors.phone}
                    value={form.phone}
                    onChange={(v) => update("phone", v)}
                  />
                  <Input
                    label="Country of residence"
                    error={fieldErrors.country}
                    value={form.country}
                    onChange={(v) => update("country", v)}
                  />
                  <Field label="Customer type">
                    <select
                      value={form.customerType}
                      onChange={(e) =>
                        setForm((v) => ({
                          ...v,
                          customerType: e.target.value as Form["customerType"],
                          licenseCountry:
                            e.target.value === "philippine_resident"
                              ? "Philippines"
                              : "",
                        }))
                      }
                      className="field"
                    >
                      <option value="philippine_resident">
                        Philippine resident
                      </option>
                      <option value="international_visitor">
                        International visitor
                      </option>
                    </select>
                  </Field>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="minimal-document-step">
                <Heading
                  title="Upload Documents"
                  text="Your documents are securely stored and reviewed by KJM before motorcycle pickup."
                />
                <div className="minimal-upload-grid">
                  <Upload
                    required
                    file={
                      form.customerType === "international_visitor"
                        ? files.passport
                        : files.government_id
                    }
                    label={
                      form.customerType === "international_visitor"
                        ? "Passport identification page"
                        : "Government-issued ID"
                    }
                    onChange={(f) =>
                      setFiles((v) => ({
                        ...v,
                        [form.customerType === "international_visitor"
                          ? "passport"
                          : "government_id"]: f,
                      }))
                    }
                  />
                  <Upload
                    required
                    file={files.drivers_license_front}
                    label="Driver's license front"
                    onChange={(f) =>
                      setFiles((v) => ({ ...v, drivers_license_front: f }))
                    }
                  />
                  <Upload
                    file={files.drivers_license_back}
                    label="Driver's license back (optional)"
                    onChange={(f) =>
                      setFiles((v) => ({ ...v, drivers_license_back: f }))
                    }
                  />
                  {form.customerType === "international_visitor" && (
                    <Upload
                      file={files.international_driving_permit}
                      label="International Driving Permit (if applicable)"
                      onChange={(f) =>
                        setFiles((v) => ({
                          ...v,
                          international_driving_permit: f,
                        }))
                      }
                    />
                  )}
                </div>
                <details
                  ref={documentDetails}
                  className="minimal-document-info"
                >
                  <summary>
                    Document information <span>Required</span>
                  </summary>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Input
                      label="Name on identity document"
                      value={form.identityName}
                      onChange={(v) => update("identityName", v)}
                    />
                    <Input
                      label="Name on driver's license"
                      value={form.licenseName}
                      onChange={(v) => update("licenseName", v)}
                    />
                    <Input
                      label="License issuing country"
                      value={form.licenseCountry}
                      onChange={(v) => update("licenseCountry", v)}
                    />
                    <Input
                      label="License expiration"
                      type="date"
                      value={form.licenseExpiration}
                      onChange={(v) => update("licenseExpiration", v)}
                    />
                    <Input
                      label="Permitted vehicle categories"
                      value={form.vehicleCategories}
                      onChange={(v) => update("vehicleCategories", v)}
                    />
                    {form.customerType === "international_visitor" && (
                      <Input
                        label="Philippines entry date"
                        type="date"
                        value={form.entryDate}
                        onChange={(v) => update("entryDate", v)}
                      />
                    )}
                  </div>
                </details>
              </div>
            )}
            {step === 3 && (
              <div className="minimal-document-step">
                <SecurityDepositChoice
                  options={
                    depositOptions
                      ? { ...depositOptions, id_enabled: false }
                      : depositOptions
                  }
                  value={depositOption}
                  documentType={depositDocument}
                  onChange={(value) => {
                    setDepositOption(value);
                    setQuote((current) =>
                      current
                        ? {
                            ...current,
                            policy_version: undefined,
                            deposit_required_centavos: null,
                          }
                        : current,
                    );
                  }}
                  onDocumentChange={setDepositDocument}
                />
              </div>
            )}
            {step === 4 && (
              <div>
                <Heading
                  title="Review & Confirm"
                  text="Check your reservation before confirming."
                />
                <PaymentMethodChoice
                  value={paymentMethod}
                  methods={onlineMethods}
                  onlineEnabled={
                    onlineEnabled &&
                    !!serviceConfig?.qrph_enabled &&
                    !!serviceConfig?.qrph_ready
                  }
                  cashEnabled={serviceConfig?.cash_enabled !== false}
                  disabled={busy}
                  onChange={setPaymentMethod}
                />
                <section className="border-deep-teal/10 rounded-xl border bg-white p-4 text-sm">
                  <h3 className="text-deep-teal font-bold">
                    Your booking details
                  </h3>
                  <p className="text-muted mt-2">
                    {form.fullName} · {form.email}
                  </p>
                  <p className="text-muted mt-1">{form.phone}</p>
                  <div className="border-deep-teal/10 mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
                    <div>
                      <p className="text-deep-teal font-semibold">
                        {services.delivery ? "Delivery" : "Self pickup at KJM"}
                      </p>
                      {services.delivery && (
                        <p className="text-muted mt-1">
                          {services.delivery.address}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-deep-teal font-semibold">
                        {services.collection
                          ? "Collection"
                          : "Self return to KJM"}
                      </p>
                      {services.collection && (
                        <p className="text-muted mt-1">
                          {services.collection.address}
                        </p>
                      )}
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="text-ocean cursor-pointer text-xs font-semibold">
                      Documents & selected extras
                    </summary>
                    <p className="text-muted mt-2 text-xs">
                      {Object.values(files).filter(Boolean).length} documents
                      ready for review.{" "}
                      {selectedExtras.length
                        ? selectedExtras
                            .map(
                              (extra) =>
                                `${extraQuantities[extra.id]}× ${extra.name}`,
                            )
                            .join(", ")
                        : "No extras selected."}
                    </p>
                  </details>
                  {form.customerType === "international_visitor" && (
                    <p className="text-muted mt-3 text-xs">
                      Your booking requires owner approval. Payment becomes
                      available after confirmation.
                    </p>
                  )}
                </section>
                <div className="checkout-mobile-summary">{checkoutSummary}</div>
                <TermsAcceptance
                  acceptedVersion={acceptedTermsVersion}
                  onChange={setAcceptedTermsVersion}
                />
                <label className="text-muted mt-5 flex gap-3 text-sm leading-6">
                  <input
                    required
                    type="checkbox"
                    checked={consented}
                    onChange={(event) => setConsented(event.target.checked)}
                    className="accent-ocean mt-1"
                  />
                  I confirm the information is accurate, consent to verification
                  processing, and understand KJM staff must approve this
                  request.
                </label>
                <p className="text-muted mt-4 text-xs leading-5">
                  {settings?.privacy_notice}
                </p>
                {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
                  <div className="mt-5">
                    <TurnstileChallenge onToken={setCaptchaToken} />
                  </div>
                )}
              </div>
            )}
            {step === 5 && (
              <div className="py-8 text-center">
                <FileCheck2 className="text-ocean mx-auto size-12" />
                <h2 className="text-deep-teal mt-5 text-3xl font-bold">
                  {reservationStatus === "confirmed"
                    ? "Your booking is confirmed!"
                    : "Booking Request Received"}
                </h2>
                <p className="text-muted mt-3">
                  Reference{" "}
                  <strong className="text-deep-teal">{reference}</strong>
                </p>
                <p className="text-muted mx-auto mt-4 max-w-lg text-sm leading-7">
                  {reservationStatus === "confirmed"
                    ? "Your motorcycle has been reserved for your selected dates. Your identification documents are pending verification. Document approval is required before motorcycle pickup."
                    : "Your booking request is awaiting KJM approval. Identity and driving-document review continue separately."}{" "}
                  Keep this browser session to view protected status updates.
                </p>
                {bookingId && <BookingEmailStatus bookingId={bookingId} />}
                {bookingId && (
                  <Link
                    href={`/guest/booking/${bookingId}`}
                    className="text-ocean mt-4 inline-block font-bold"
                  >
                    View booking updates
                  </Link>
                )}
                <dl className="mt-6 space-y-3 text-sm">
                  {[
                    ["Motorcycle", motorcycle.model],
                    ["Rental duration", durationLabel],
                    [
                      "Rental dates",
                      `${formatBookingDate(form.pickup)} → ${formatBookingDate(form.returnAt)}`,
                    ],
                    [
                      "Extras",
                      selectedExtras
                        .map(
                          (extra) =>
                            `${extra.name} × ${extraQuantities[extra.id]}`,
                        )
                        .join(", ") || "None",
                    ],
                    [
                      "Rental total",
                      quote
                        ? formatCentavos(quotedPayable)
                        : "Server record required",
                    ],
                    [
                      "Deposit arrangement",
                      depositOption === "cash"
                        ? "Cash Security Deposit"
                        : `Eligible ID Card Deposit — ${depositDocument}`,
                    ],
                    [
                      "Cash due at pickup",
                      quote?.cash_due_at_pickup_centavos != null
                        ? formatCentavos(quote.cash_due_at_pickup_centavos)
                        : "Server record required",
                    ],
                    [
                      "Booking status",
                      reservationStatus === "confirmed"
                        ? "Confirmed"
                        : "Pending manual approval",
                    ],
                    ["Document verification", "Pending KJM review"],
                    [
                      "Payment",
                      paymentMethod === "online"
                        ? "Online · Awaiting verification"
                        : "Cash on Pickup · Unpaid",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="bg-sand/40 flex flex-wrap justify-between gap-3 rounded-xl p-3 text-left"
                    >
                      <dt className="font-bold">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <Link href="/" className="minimal-home-button">
                  Back to Home
                </Link>
                {bookingId && (
                  <Link
                    href={`/guest/booking/${bookingId}`}
                    className="bg-ocean mt-6 inline-flex rounded-full px-5 py-3 text-sm font-bold text-white"
                  >
                    View secure booking status
                  </Link>
                )}
              </div>
            )}
            {busy && step === 4 && (
              <div className="minimal-transfer" role="status">
                <p>
                  {uploadProgress.total
                    ? `Secure uploads: ${uploadProgress.completed} of ${uploadProgress.total}`
                    : "Validating your reservation…"}
                </p>
                {uploadProgress.total > 0 && (
                  <progress
                    max={uploadProgress.total}
                    value={uploadProgress.completed}
                  />
                )}
              </div>
            )}
            {step === 5 && paymentMethod === "online" && (
              <div className="border-deep-teal/15 mt-5 space-y-3 rounded-2xl border p-4">
                {paymentMessage && (
                  <p role="status" className="text-muted text-sm leading-6">
                    {paymentMessage}
                  </p>
                )}
                {reservationStatus === "confirmed" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void payOnline(bookingId)}
                    className="bg-ocean min-h-11 rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy
                      ? "Opening secure checkout…"
                      : "Continue to secure checkout"}
                  </button>
                )}
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            {error && step < 5 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void resetRentalDates()}
                className="text-ocean mt-3 min-h-11 text-sm font-bold underline"
              >
                Choose different rental dates
              </button>
            )}
          </div>
          {step < 5 && (
            <div className="minimal-booking-actions">
              <button
                disabled={step === 0 || busy}
                onClick={() => {
                  setStep((v) => (preselected && v === 1 ? 1 : v - 1));
                  if (preselected && step === 1) router.push("/motorcycles");
                }}
                className="border-deep-teal/15 text-deep-teal disabled:bg-sand disabled:text-muted inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-bold disabled:opacity-100"
              >
                <ArrowLeft className="size-4" />
                Back
              </button>
              {step === 4 ? (
                <button
                  disabled={
                    !configured ||
                    !submissionEnabled ||
                    !dates ||
                    !quote?.policy_version ||
                    !serviceQuote ||
                    !files.drivers_license_front ||
                    !(form.customerType === "international_visitor"
                      ? files.passport
                      : files.government_id) ||
                    (paymentMethod === "online" &&
                      (!onlineEnabled ||
                        !serviceConfig?.qrph_enabled ||
                        !serviceConfig?.qrph_ready)) ||
                    busy ||
                    !hasRequiredBookingAcceptance(
                      consented,
                      acceptedTermsVersion,
                    ) ||
                    (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) &&
                      !captchaToken)
                  }
                  onClick={submit}
                  className="bg-sunset text-deep-teal disabled:bg-sand disabled:text-muted inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold disabled:opacity-100"
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="size-4" />
                  )}
                  {busy
                    ? "Submitting…"
                    : paymentMethod === "online"
                      ? "Continue to Secure Payment"
                      : "Confirm Booking"}
                </button>
              ) : (
                <button
                  disabled={
                    busy ||
                    (step > 0 && !configured) ||
                    (step === 1 && !dates) ||
                    (step === 3 &&
                      (!files.drivers_license_front ||
                        !(form.customerType === "international_visitor"
                          ? files.passport
                          : files.government_id)))
                  }
                  onClick={next}
                  className="bg-sunset text-deep-teal inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
                >
                  {busy ? "Checking…" : "Continue"}
                  <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          )}
        </section>
        <aside className="checkout-desktop-summary">{checkoutSummary}</aside>
      </div>
    </div>
  );
}
function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-deep-teal text-2xl font-bold">{title}</h2>
      <p className="text-muted mt-2 text-sm">{text}</p>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-deep-teal text-sm font-bold">
      {label}
      {children}
    </label>
  );
}
function Input({
  label,
  value,
  onChange,
  type = "text",
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
}) {
  return (
    <Field label={label}>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
        aria-invalid={!!error}
      />
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-700">
          {error}
        </span>
      )}
    </Field>
  );
}

function friendlyCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safe = [
    "Please",
    "Check your service areas",
    "Service options are temporarily",
    "Review the delivery",
    "Choose",
    "Upload",
    "Use a supported",
    "Complete the",
    "Your document could not",
    "We couldn’t",
    "Accept the",
    "The unfinished request could not",
  ];
  return safe.some((prefix) => message.startsWith(prefix)) &&
    message.length < 300 &&
    !/[{}\[\]]/.test(message)
    ? message
    : "We couldn’t continue. Please check your details and try again, or contact KJM for help.";
}

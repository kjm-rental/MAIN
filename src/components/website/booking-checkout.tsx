"use client";
import {
  extraFitsMotorcycle,
  extraQuantityLimit,
  isTopBox,
} from "@/lib/booking-extras";
import {
  MotorcycleColorOptions,
  type MotorcycleColorOption,
} from "@/components/website/motorcycle-color-options";
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
import { SignatureChoice } from "./signature-choice";
import { uploadGuestDocument } from "@/lib/guest-checkout/upload-document";
import {
  signatureStrokesSchema,
  type SignatureStrokes,
} from "@/lib/electronic-signature";
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
  UserRound,
  Mail,
  Phone,
  Globe2,
  MapPin,
  Check,
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
import { InlineQrPayment, type InlinePaymentResult } from "./inline-qr-payment";

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
  compatible_model_ids?: string[];
  compatible_unit_ids?: string[];
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
  const [selectedColor, setSelectedColor] = useState("");
  const [colorResult, setColorResult] = useState<{
    key: string;
    options: MotorcycleColorOption[];
    error: string;
  } | null>(null);
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
  const [signatureStrokes, setSignatureStrokes] = useState<SignatureStrokes>(
    [],
  );
  const [signatureMethod, setSignatureMethod] = useState<"drawn" | "uploaded">(
    "drawn",
  );
  const [signatureImage, setSignatureImage] = useState("");
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
  const [inlinePayment, setInlinePayment] =
    useState<InlinePaymentResult | null>(null);
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
      setInlinePayment(result);
      if (result.status === "paid") {
        setReservationStatus(result.bookingStatus ?? "pending");
        setStep(5);
      }
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
  const [depositDocument, setDepositDocument] = useState(
    depositOptions?.accepted_document_types.length === 1
      ? depositOptions.accepted_document_types[0]
      : "",
  );
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
  const colorKey = dates
    ? `${motorcycle.id}:${dates.startAt}:${dates.endAt}`
    : "";
  const currentColors = colorResult?.key === colorKey ? colorResult : null;
  useEffect(() => {
    if (!dates || !motorcycle.id || draftBookingId || bookingId) return;
    let cancelled = false;
    const key = `${motorcycle.id}:${dates.startAt}:${dates.endAt}`;
    void Promise.resolve(
      createClient().rpc("get_motorcycle_color_availability", {
        p_model_id: motorcycle.id,
        p_start_at: dates.startAt,
        p_end_at: dates.endAt,
      }),
    )
      .then(({ data, error: colorError }) => {
        if (cancelled) return;
        const options = data ?? [];
        setColorResult({
          key,
          options,
          error: colorError
            ? "Color availability is temporarily unavailable. Please refresh or contact KJM."
            : "",
        });
        if (!colorError)
          setSelectedColor((current) => {
            if (
              current &&
              !options.some((o) => o.color === current && o.available_count > 0)
            )
              return "";
            return current;
          });
      })
      .catch(() => {
        if (!cancelled)
          setColorResult({
            key,
            options: [],
            error:
              "Color availability is temporarily unavailable. Please refresh or contact KJM.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [dates, motorcycle.id, draftBookingId, bookingId]);
  async function recheckColor() {
    if (!dates || !motorcycle.id) throw Error("Choose rental dates first.");
    const result = await createClient().rpc(
      "get_motorcycle_color_availability",
      {
        p_model_id: motorcycle.id,
        p_start_at: dates.startAt,
        p_end_at: dates.endAt,
      },
    );
    if (result.error)
      throw Error(
        "Color availability is temporarily unavailable. Please refresh or contact KJM.",
      );
    setColorResult({ key: colorKey, options: result.data ?? [], error: "" });
    if (
      result.data?.length &&
      !result.data.some(
        (o) => o.color === selectedColor && o.available_count > 0,
      )
    )
      throw Error(
        "Choose an available motorcycle color for these dates. Your previous choice may no longer be available.",
      );
  }
  const durationLabel = dates
    ? (rentalDuration(dates.startAt, dates.endAt)?.label ?? "Choose your dates")
    : "Choose your dates";
  const [readyAccessoryIds, setReadyAccessoryIds] = useState<{
    key: string;
    ids: string[];
  }>({ key: "", ids: [] });
  const accessoryKey = dates
    ? `${motorcycle.id}:${dates.startAt}:${dates.endAt}:${selectedColor ?? ""}`
    : "";
  useEffect(() => {
    if (!dates || !motorcycle.id) return;
    let cancelled = false;
    const key = `${motorcycle.id}:${dates.startAt}:${dates.endAt}:${selectedColor ?? ""}`;
    void createClient()
      .rpc("get_available_booking_accessories", {
        p_model_id: motorcycle.id,
        p_selected_color: selectedColor || null,
        p_start_at: dates.startAt,
        p_end_at: dates.endAt,
      })
      .then(({ data, error }) => {
        if (!cancelled)
          setReadyAccessoryIds({
            key,
            ids: error ? [] : (data ?? []).map((item) => item.id),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [motorcycle.id, dates, selectedColor]);
  const availableExtras = extras.filter(
    (extra) =>
      extraFitsMotorcycle(extra, motorcycle.id ?? undefined) &&
      (!(isTopBox(extra.name) || extra.compatible_unit_ids?.length) ||
        (readyAccessoryIds.key === accessoryKey &&
          readyAccessoryIds.ids.includes(extra.id))),
  );
  const selectedExtras = availableExtras.filter(
    (extra) => (extraQuantities[extra.id] ?? 0) > 0,
  );
  const extraItems = selectedExtras.map((extra) => ({
    id: extra.id,
    quantity: Math.min(extraQuantities[extra.id], extraQuantityLimit(extra)),
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
        await recheckColor();
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
      if (signatureMethod === "uploaded" && !signatureImage)
        throw new Error(
          "Please upload your signature image before confirming.",
        );
      if (
        signatureMethod === "drawn" &&
        !signatureStrokesSchema.safeParse(signatureStrokes).success
      )
        throw new Error(
          "Please draw your signature in the signature box before confirming.",
        );
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
      if (!draftBookingId) await recheckColor();
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
          p_selected_color: selectedColor || null,
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
          booking.error ||
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
        await uploadGuestDocument(booking.booking_id, kind, file);
        documentProgress.current.set(kind, { file, path: "", uploaded: true });
        setUploadProgress((v) => ({ ...v, completed: v.completed + 1 }));
      }
      const finalResponse = await fetch(
        `/api/guest/bookings/${booking.booking_id}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signatureName: form.fullName.trim(),
            signatureStrokes,
            signatureMethod,
            signatureImage:
              signatureMethod === "uploaded" ? signatureImage : undefined,
            termsVersion: acceptedTermsVersion!,
            accepted: true,
          }),
        },
      );
      const finalRecord = await finalResponse.json();
      if (!finalResponse.ok)
        throw new Error(
          finalRecord.error ||
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
      if (paymentMethod === "online") {
        await payOnline(booking.booking_id);
      } else setStep(5);
    } catch (e) {
      setError(friendlyCheckoutError(e));
    } finally {
      submissionPending.current = false;
      setBusy(false);
    }
  }
  const checkoutSummary = (
    <CheckoutSummary
      selectedColor={selectedColor || null}
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
                          setExtraQuantities({});
                          setSelectedColor("");
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
                  <MotorcycleColorOptions
                    options={currentColors?.options ?? []}
                    value={selectedColor}
                    onChange={(color) => {
                      setSelectedColor(color);
                      setError("");
                    }}
                    loading={!currentColors}
                    error={currentColors?.error ?? ""}
                    disabled={busy || Boolean(draftBookingId)}
                  />
                )}
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
            {step === 1 && availableExtras.length > 0 && (
              <div className="border-deep-teal/10 mt-8 border-t pt-8">
                <Heading
                  title="A few finishing touches."
                  text="Choose up to 2 helmets and 2 raincoats. Top boxes appear only when a compatible, installation-ready unit is available for your dates. Prices below are per item."
                />
                {availableExtras.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {availableExtras.map((extra) => {
                      const quantity = Math.min(
                        extraQuantities[extra.id] ?? 0,
                        extraQuantityLimit(extra),
                      );
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
                                ? " / item / rental day"
                                : " / item / rental"}
                              <span className="text-muted mt-1 block text-xs font-normal">
                                Up to {extraQuantityLimit(extra)} per booking
                              </span>
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
                              disabled={quantity >= extraQuantityLimit(extra)}
                              onClick={() =>
                                setExtraQuantities((current) => ({
                                  ...current,
                                  [extra.id]: Math.min(
                                    quantity + 1,
                                    extraQuantityLimit(extra),
                                  ),
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
              <div className="rider-details">
                <header className="rider-details-header">
                  <span className="rider-details-icon">
                    <UserRound size={24} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="rider-details-eyebrow">
                      A little introduction
                    </p>
                    <h2>Let’s get to know you.</h2>
                    <p>Just the essentials to get your island ride ready.</p>
                  </div>
                </header>
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
                <section className="rider-details-group">
                  <div className="rider-details-group-title">
                    <h3>Your information</h3>
                    <span>All fields required</span>
                  </div>
                  <div className="rider-details-grid">
                    <Input
                      label="Full legal name"
                      placeholder="Name as shown on your ID"
                      autoComplete="name"
                      icon={<UserRound size={17} />}
                      error={fieldErrors.fullName}
                      value={form.fullName}
                      onChange={(v) => update("fullName", v)}
                    />
                    <Input
                      label="Country of residence"
                      placeholder="e.g. Philippines"
                      autoComplete="country-name"
                      icon={<Globe2 size={17} />}
                      error={fieldErrors.country}
                      value={form.country}
                      onChange={(v) => update("country", v)}
                    />
                  </div>
                  <p className="rider-details-hint">
                    Use the same name as your identification for a smoother
                    document review.
                  </p>
                </section>
                <section className="rider-details-group">
                  <div className="rider-details-group-title">
                    <h3>How can we reach you?</h3>
                  </div>
                  <div className="rider-details-grid">
                    <Input
                      label="Email address"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      icon={<Mail size={17} />}
                      error={fieldErrors.email}
                      value={form.email}
                      onChange={(v) => update("email", v)}
                    />
                    <Input
                      label="Mobile number"
                      type="tel"
                      placeholder="+63 9XX XXX XXXX"
                      autoComplete="tel"
                      icon={<Phone size={17} />}
                      error={fieldErrors.phone}
                      value={form.phone}
                      onChange={(v) => update("phone", v)}
                    />
                  </div>
                  <p className="rider-details-hint">
                    Include your country code so our team can reach you about
                    your booking.
                  </p>
                </section>
                <fieldset className="rider-details-group rider-type-group">
                  <legend>Where are you visiting from?</legend>
                  <div className="rider-type-grid">
                    {(
                      [
                        {
                          value: "philippine_resident",
                          title: "Philippine resident",
                          description: "I live in the Philippines",
                          icon: MapPin,
                        },
                        {
                          value: "international_visitor",
                          title: "International visitor",
                          description: "I’m visiting from overseas",
                          icon: Globe2,
                        },
                      ] as const
                    ).map((choice) => (
                      <label
                        key={choice.value}
                        className={`rider-type-card ${form.customerType === choice.value ? "is-selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="renter-type"
                          value={choice.value}
                          checked={form.customerType === choice.value}
                          onChange={() =>
                            setForm((v) => ({
                              ...v,
                              customerType: choice.value,
                              licenseCountry:
                                choice.value === "philippine_resident"
                                  ? "Philippines"
                                  : "",
                            }))
                          }
                        />
                        <choice.icon size={20} aria-hidden="true" />
                        <span>
                          <strong>{choice.title}</strong>
                          <small>{choice.description}</small>
                        </span>
                        <span className="rider-type-check" aria-hidden="true">
                          {form.customerType === choice.value && (
                            <Check size={12} />
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  {fieldErrors.customerType && (
                    <p role="alert" className="text-sm text-red-700">
                      {fieldErrors.customerType}
                    </p>
                  )}
                </fieldset>
                <div className="rider-details-note">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <p>
                    Your details help us arrange your rental and review your
                    documents. You’ll upload your ID in the next step.
                  </p>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="minimal-document-step">
                <header className="rider-details-header">
                  <span className="rider-details-icon">
                    <ShieldCheck size={25} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="rider-details-eyebrow">
                      One step closer to your ride
                    </p>
                    <h2>Your documents, ready to go.</h2>
                    <p>
                      Upload clear copies. KJM reviews your ID and driving
                      eligibility before pickup.
                    </p>
                  </div>
                </header>
                <div className="document-checklist-bar">
                  <span>
                    <FileCheck2 size={16} aria-hidden="true" /> Your document
                    checklist
                  </span>
                  <strong>
                    {
                      [
                        form.customerType === "international_visitor"
                          ? files.passport
                          : files.government_id,
                        files.drivers_license_front,
                      ].filter(Boolean).length
                    }{" "}
                    of 2 required files selected
                  </strong>
                </div>
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
                  open
                >
                  <summary>
                    <span className="document-info-title">
                      <FileCheck2 size={18} aria-hidden="true" /> Details from
                      your documents
                    </span>
                    <span>Required</span>
                  </summary>
                  <p className="document-info-hint">
                    Copy these details exactly as printed on your ID and
                    license.
                  </p>
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
                  options={depositOptions}
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
              <div className="reservation-review">
                <header className="rider-details-header">
                  <span className="rider-details-icon">
                    <FileCheck2 size={25} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="rider-details-eyebrow">The final check</p>
                    <h2>Your adventure, almost ready.</h2>
                    <p>
                      {bookingId
                        ? "Your signed booking is saved. Complete your payment below."
                        : "Review your details before sending your reservation."}
                    </p>
                  </div>
                </header>
                <div className="review-total-banner">
                  <div>
                    <span>Rental & services</span>
                    <strong>{formatCentavos(quotedPayable)}</strong>
                  </div>
                  <div>
                    <span>Refundable cash deposit</span>
                    <strong>
                      {quote?.deposit_required_centavos == null
                        ? "Pending quote"
                        : formatCentavos(quote.deposit_required_centavos)}
                    </strong>
                  </div>
                  <p>
                    <ShieldCheck size={15} aria-hidden="true" /> Deposit is
                    collected separately at handover.
                  </p>
                </div>
                <PaymentMethodChoice
                  value={paymentMethod}
                  methods={onlineMethods}
                  onlineEnabled={
                    onlineEnabled &&
                    !!serviceConfig?.qrph_enabled &&
                    !!serviceConfig?.qrph_ready
                  }
                  cashEnabled={serviceConfig?.cash_enabled !== false}
                  disabled={busy || !!bookingId}
                  onChange={setPaymentMethod}
                />
                <section className="review-reservation-card">
                  <div className="review-card-heading">
                    <UserRound size={18} aria-hidden="true" />
                    <h3>Your booking details</h3>
                    {!bookingId && (
                      <button type="button" onClick={() => setStep(2)}>
                        Edit details
                      </button>
                    )}
                  </div>
                  <div className="review-ride-line">
                    <span>{motorcycle.model}</span>
                    {selectedColor && <strong>{selectedColor}</strong>}
                  </div>
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
                <section className="review-consent">
                  <div className="review-card-heading">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <h3>
                      {bookingId
                        ? "Your signed agreement"
                        : "Before you confirm"}
                    </h3>
                  </div>
                  <fieldset
                    disabled={busy || !!bookingId}
                    className="min-w-0 border-0 p-0"
                  >
                    <SignatureChoice
                      readOnly={!!bookingId}
                      method={signatureMethod}
                      onMethod={setSignatureMethod}
                      strokes={signatureStrokes}
                      onStrokes={setSignatureStrokes}
                      image={signatureImage}
                      onImage={setSignatureImage}
                    />
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
                      I confirm the information is accurate, consent to
                      verification processing, and understand KJM staff must
                      approve this request.
                    </label>
                  </fieldset>
                  <details className="review-privacy">
                    <summary>How we use your information</summary>
                    <p>{settings?.privacy_notice}</p>
                  </details>
                </section>
                {!bookingId && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
                  <div className="mt-5">
                    <TurnstileChallenge onToken={setCaptchaToken} />
                  </div>
                )}
                {bookingId && paymentMethod === "online" && (
                  <div className="py-5">
                    <h2 className="text-deep-teal text-2xl font-bold">
                      Complete your payment
                    </h2>
                    <p className="text-muted mt-2 text-sm">
                      Reference {reference}. Your slot is reserved while payment
                      is pending.
                    </p>
                    <InlineQrPayment
                      showStatusLink={false}
                      bookingId={bookingId}
                      initial={inlinePayment}
                      onPaid={(result) => {
                        setInlinePayment(result);
                        setReservationStatus(result.bookingStatus ?? "pending");
                        setStep(5);
                      }}
                    />
                    {paymentMessage && (
                      <p role="status" className="mt-3 text-sm">
                        {paymentMessage}
                      </p>
                    )}
                    {!inlinePayment?.qrImage && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void payOnline(bookingId)}
                        className="bg-ocean mt-4 rounded-full px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busy ? "Preparing payment…" : "Show payment QR"}
                      </button>
                    )}
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
                {selectedColor && (
                  <p className="text-deep-teal mt-3 font-bold">
                    Selected color: {selectedColor}
                  </p>
                )}
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
                        ? inlinePayment?.status === "paid"
                          ? "QRPh · Paid and verified"
                          : "QRPh · Awaiting payment"
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
                  {bookingId
                    ? "Preparing payment QR…"
                    : uploadProgress.total
                      ? `Secure uploads: ${uploadProgress.completed} of ${uploadProgress.total}`
                      : "Validating your reservation…"}
                </p>
                {!bookingId && uploadProgress.total > 0 && (
                  <progress
                    max={uploadProgress.total}
                    value={uploadProgress.completed}
                  />
                )}
              </div>
            )}
            {step === 5 &&
              paymentMethod === "online" &&
              inlinePayment?.status !== "paid" && (
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
          {step < 5 && !(bookingId && paymentMethod === "online") && (
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
                      ? "Confirm & show payment QR"
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
  placeholder,
  autoComplete,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Field label={label}>
      <span className="rider-input-wrap">
        {icon && (
          <span className="rider-input-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          required
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`field ${icon ? "rider-input-with-icon" : ""}`}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
        />
      </span>
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
    "Your upload session",
    "This document could not",
    "This booking has expired",
    "Secure upload is temporarily",
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

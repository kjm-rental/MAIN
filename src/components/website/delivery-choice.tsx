"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Route,
  Store,
  Truck,
} from "lucide-react";
import type { ServiceConfig, ServiceSelection } from "@/lib/delivery/schema";
import styles from "./delivery-choice.module.css";

const options = [
  {
    key: "self",
    title: "Pick up & return",
    description: "Meet us at KJM for both ends of your ride.",
    tag: "Free",
    Icon: Store,
  },
  {
    key: "delivery",
    title: "Bring it to me",
    description: "We deliver. You return the motorcycle to KJM.",
    tag: "Delivery fee",
    Icon: Truck,
  },
  {
    key: "collection",
    title: "Collect it from me",
    description: "Pick up at KJM. We collect when you’re done.",
    tag: "Collection fee",
    Icon: MapPin,
  },
  {
    key: "both",
    title: "Take care of both",
    description: "Delivery and collection at your chosen locations.",
    tag: "Service fees",
    Icon: Route,
  },
] as const;
const blank = () => ({
  areaId: "",
  address: "",
  hotel: "",
  landmark: "",
  mapsUrl: "",
  instructions: "",
});
const pesos = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
const hours = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour >= 12 ? "PM" : "AM"}`;
};

export function DeliveryChoice({
  config,
  value,
  onChange,
}: {
  config: ServiceConfig;
  value: ServiceSelection;
  onChange: (v: ServiceSelection) => void;
}) {
  if (!config.enabled) return null;
  const mode = value.delivery
    ? value.collection
      ? "both"
      : "delivery"
    : value.collection
      ? "collection"
      : "self";
  return (
    <section
      className={styles.section}
      aria-labelledby="ride-arrangements-title"
    >
      <header className={styles.header}>
        <span className={styles.eyebrow}>
          FROM YOUR FIRST MILE TO YOUR LAST
        </span>
        <h3 id="ride-arrangements-title">Your ride. Your way.</h3>
        <p>Choose how you’d like to receive and return your motorcycle.</p>
      </header>
      <fieldset className={styles.choices}>
        <legend className={styles.srOnly}>
          Pickup and return arrangements
        </legend>
        {options.map(({ key, title, description, tag, Icon }) => (
          <label
            key={key}
            className={`${styles.option} ${mode === key ? styles.selected : ""}`}
          >
            <input
              className={styles.radio}
              type="radio"
              name="delivery-mode"
              value={key}
              checked={mode === key}
              onChange={() =>
                onChange({
                  delivery: ["delivery", "both"].includes(key)
                    ? (value.delivery ?? blank())
                    : null,
                  collection: ["collection", "both"].includes(key)
                    ? (value.collection ?? blank())
                    : null,
                })
              }
            />
            <span className={styles.optionTop}>
              <span className={styles.icon}>
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <span className={styles.check} aria-hidden="true">
                {mode === key && <Check size={13} strokeWidth={3} />}
              </span>
            </span>
            <span className={styles.optionTitle}>{title}</span>
            <span className={styles.description}>{description}</span>
            <span
              className={`${styles.tag} ${key === "self" ? styles.free : ""}`}
            >
              {tag}
              {key !== "self" && <ArrowUpRight size={12} aria-hidden="true" />}
            </span>
          </label>
        ))}
      </fieldset>
      {mode === "self" && (
        <p className={styles.selfNote}>
          <Store size={16} aria-hidden="true" />
          Pickup and return at KJM. No delivery or collection fees.
        </p>
      )}
      {(["delivery", "collection"] as const).map((leg) => {
        const detail = value[leg];
        if (!detail) return null;
        const isDelivery = leg === "delivery";
        const area = config.areas.find((a) => a.id === detail.areaId);
        const update = (key: keyof typeof detail, next: string) =>
          onChange({ ...value, [leg]: { ...detail, [key]: next } });
        return (
          <fieldset key={leg} className={styles.details}>
            <legend className={styles.srOnly}>
              {isDelivery ? "Delivery" : "Collection"} details
            </legend>
            <div className={styles.detailsHeader}>
              <span className={styles.detailIcon}>
                {isDelivery ? (
                  <ArrowUpRight size={20} aria-hidden="true" />
                ) : (
                  <ArrowDownLeft size={20} aria-hidden="true" />
                )}
              </span>
              <div>
                <h4>
                  {isDelivery
                    ? "Where should we bring your ride?"
                    : "Where should we collect your ride?"}
                </h4>
                <p>At your scheduled {isDelivery ? "pickup" : "return"} time</p>
              </div>
              {area && (
                <span className={styles.fee}>
                  {pesos(isDelivery ? area.delivery_php : area.collection_php)}
                  <small>{isDelivery ? "delivery" : "collection"}</small>
                </span>
              )}
            </div>
            <div className={styles.form}>
              <label className={styles.full}>
                Service area <span className={styles.required}>Required</span>
                <span className={styles.selectWrap}>
                  <select
                    required
                    value={detail.areaId}
                    onChange={(e) => update("areaId", e.target.value)}
                  >
                    <option value="">Choose your area</option>
                    {config.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} —{" "}
                        {pesos(isDelivery ? a.delivery_php : a.collection_php)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </label>
              <label className={styles.full}>
                Street address <span className={styles.required}>Required</span>
                <input
                  required
                  maxLength={500}
                  autoComplete="street-address"
                  placeholder="Building / house number, street and barangay"
                  value={detail.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </label>
              <label>
                Hotel or accommodation{" "}
                <span className={styles.optional}>Optional</span>
                <input
                  maxLength={150}
                  placeholder="e.g. your hotel or resort"
                  value={detail.hotel}
                  onChange={(e) => update("hotel", e.target.value)}
                />
              </label>
              <label>
                Nearby landmark{" "}
                <span className={styles.optional}>Optional</span>
                <input
                  maxLength={150}
                  placeholder="Help our team find you"
                  value={detail.landmark}
                  onChange={(e) => update("landmark", e.target.value)}
                />
              </label>
              <details className={styles.more}>
                <summary>
                  Add a map link or directions <span>Optional</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <div className={styles.extraFields}>
                  <label>
                    Google Maps link
                    <input
                      type="url"
                      inputMode="url"
                      maxLength={500}
                      placeholder="https://maps.app.goo.gl/…"
                      value={detail.mapsUrl}
                      onChange={(e) => update("mapsUrl", e.target.value)}
                    />
                  </label>
                  <label>
                    Anything we should know?
                    <textarea
                      rows={2}
                      maxLength={500}
                      placeholder="Meeting point, access instructions or other helpful details"
                      value={detail.instructions}
                      onChange={(e) => update("instructions", e.target.value)}
                    />
                  </label>
                </div>
              </details>
            </div>
            <p className={styles.hours}>
              <Clock3 size={14} aria-hidden="true" />
              Available {hours(config[`${leg}_open`])}–
              {hours(config[`${leg}_close`])}
              <span>Philippine time</span>
            </p>
          </fieldset>
        );
      })}
    </section>
  );
}

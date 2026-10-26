"use client";
import type { ServiceConfig, ServiceSelection } from "@/lib/delivery/schema";
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
  const blank = () => ({
    areaId: "",
    address: "",
    hotel: "",
    landmark: "",
    mapsUrl: "",
    instructions: "",
  });
  return (
    <section className="my-5 space-y-4">
      <h3 className="text-deep-teal text-lg font-bold">
        How would you like to receive and return your motorcycle?
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["self", "Self Pickup & Return — FREE"],
          ["delivery", "Delivery Only — Additional Fee"],
          ["collection", "Collection Only — Additional Fee"],
          ["both", "Delivery & Collection — Additional Fees"],
        ].map(([key, label]) => (
          <label key={key} className="rounded-xl border bg-white p-3 text-sm">
            <input
              type="radio"
              name="delivery-mode"
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
            />{" "}
            {label}
          </label>
        ))}
      </div>
      {(["delivery", "collection"] as const).map((leg) => {
        const detail = value[leg];
        if (!detail) return null;
        return (
          <fieldset key={leg} className="space-y-3 rounded-xl border p-4">
            <legend className="font-bold capitalize">{leg} details</legend>
            <p className="text-xs">
              Requested at rental {leg === "delivery" ? "pickup" : "return"}{" "}
              time · Operating hours {config[`${leg}_open`]}–
              {config[`${leg}_close`]} Asia/Manila.
            </p>
            <label className="block text-sm">
              Service area
              <select
                required
                value={detail.areaId}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [leg]: { ...detail, areaId: e.target.value },
                  })
                }
                className="mt-1 min-h-11 w-full rounded-lg border p-2"
              >
                <option value="">Select an enabled area</option>
                {config.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — ₱
                    {leg === "delivery" ? a.delivery_php : a.collection_php}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["address", "Full address (required)"],
              ["hotel", "Hotel / accommodation (optional)"],
              ["landmark", "Landmark (optional)"],
              ["mapsUrl", "Google Maps link (optional)"],
              ["instructions", "Instructions (optional)"],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}
                <input
                  required={key === "address"}
                  maxLength={key === "hotel" || key === "landmark" ? 150 : 500}
                  value={detail[key as keyof typeof detail]}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [leg]: { ...detail, [key]: e.target.value },
                    })
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border p-2"
                />
              </label>
            ))}
          </fieldset>
        );
      })}
    </section>
  );
}

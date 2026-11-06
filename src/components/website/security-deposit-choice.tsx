"use client";
import { ShieldCheck, Wallet } from "lucide-react";
import type { DepositOptions } from "@/lib/security-deposits";
import { formatCentavos } from "@/lib/currency";
export function SecurityDepositChoice({
  options,
  value,
  documentType,
  onChange,
  onDocumentChange,
}: {
  options: DepositOptions | null;
  value: string;
  documentType: string;
  onChange: (value: string) => void;
  onDocumentChange: (value: string) => void;
}) {
  return (
    <fieldset className="document-deposit">
      <legend className="text-deep-teal text-2xl font-bold">
        Choose your security deposit
      </legend>
      <p className="text-muted mt-2 text-sm leading-6">
        Your deposit arrangement is separate from rental payment and required
        identity verification. It is completed at pickup.
      </p>
      <div
        className={`deposit-choice-grid mt-5 grid gap-3 ${options?.id_enabled ? "sm:grid-cols-2" : ""}`}
      >
        <label
          className={`block rounded-2xl border p-5 ${value === "cash" ? "border-ocean bg-ocean/5" : "border-deep-teal/15 bg-white"} ${!options?.cash_enabled ? "opacity-70" : ""}`}
        >
          <input
            type="radio"
            name="depositOption"
            value="cash"
            checked={value === "cash"}
            onChange={() => onChange("cash")}
            disabled={!options?.cash_enabled}
            className="accent-ocean mr-3"
          />
          <Wallet className="text-ocean mb-3 inline-block size-5" />
          <span className="text-deep-teal block font-bold">
            Cash Security Deposit
          </span>
          <span className="text-muted mt-2 block text-sm leading-6">
            Refundable security deposit collected at motorcycle pickup, subject
            to the approved rental agreement.
          </span>
          <strong className="text-ocean mt-4 block text-xl">
            {options?.cash_enabled && options.cash_amount_centavos !== null
              ? formatCentavos(options.cash_amount_centavos)
              : "Awaiting approved policy and amount"}
          </strong>
        </label>
        {options?.id_enabled && (
          <label
            className={`block rounded-2xl border p-5 ${value === "eligible_id" ? "border-ocean bg-ocean/5" : "border-deep-teal/15 bg-white"} ${!options?.id_enabled ? "opacity-70" : ""}`}
          >
            <input
              type="radio"
              name="depositOption"
              value="eligible_id"
              checked={value === "eligible_id"}
              onChange={() => onChange("eligible_id")}
              disabled={!options?.id_enabled}
              className="accent-ocean mr-3"
            />
            <ShieldCheck className="text-ocean mb-3 inline-block size-5" />
            <span className="text-deep-teal block font-bold">
              Original ID deposit
            </span>
            <span className="text-muted mt-2 block text-sm leading-6">
              {options?.id_enabled
                ? "Leave your original ID with KJM at pickup. Collect it when you return the motorcycle."
                : "Unavailable until KJM approves a legally reviewed policy and exact permitted document types. No passport, licence or government ID is assumed eligible."}
            </span>
          </label>
        )}
      </div>
      {!options?.id_enabled && (
        <p className="deposit-unavailable-note">
          ID-card deposits are currently unavailable. Original identity
          documents are not automatically accepted as a deposit.
        </p>
      )}
      {value === "eligible_id" &&
        options?.id_enabled &&
        options.accepted_document_types.length > 1 && (
          <label className="text-deep-teal mt-5 block text-sm font-bold">
            ID type
            <select
              className="field"
              value={documentType}
              onChange={(event) => onDocumentChange(event.target.value)}
            >
              <option value="">Select an ID type</option>
              {options.accepted_document_types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        )}
      {(options?.cash_enabled || options?.id_enabled) && (
        <div className="bg-sand/50 text-muted mt-5 space-y-3 rounded-2xl p-5 text-sm leading-6">
          <p>{options.collection_instructions}</p>
          <p>{options.return_instructions}</p>
          <p>{options.dispute_instructions}</p>
        </div>
      )}
    </fieldset>
  );
}

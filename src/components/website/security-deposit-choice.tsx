"use client";
import type { DepositOptions } from "@/lib/security-deposits";
import { formatCentavos } from "@/lib/currency";
export function SecurityDepositChoice({
  options,
  value,
  onChange,
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
        Cash security deposit
      </legend>
      <p className="text-muted mt-2 text-sm leading-6">
        We accept a refundable cash security deposit only, collected at
        motorcycle pickup separately from rental payment. You do not need to
        leave or surrender your original IDs.
      </p>
      <label className="mt-5 block rounded-2xl border p-5">
        <input
          type="radio"
          name="depositOption"
          value="cash"
          checked={value === "cash"}
          onChange={() => onChange("cash")}
          disabled={!options?.cash_enabled}
          className="accent-ocean mr-3"
        />
        Cash security deposit —{" "}
        {options?.cash_enabled && options.cash_amount_centavos !== null
          ? formatCentavos(options.cash_amount_centavos)
          : "Awaiting configured amount"}
      </label>
      {options && (
        <div className="text-muted mt-5 space-y-3 text-sm leading-6">
          <p>{options.collection_instructions}</p>
          <p>{options.return_instructions}</p>
          <p>{options.dispute_instructions}</p>
        </div>
      )}
    </fieldset>
  );
}

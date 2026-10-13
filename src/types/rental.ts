export type DepositOption = "cash" | "eligible_id";
export type DepositSettings = {
  id: boolean;
  cash_enabled: boolean;
  cash_amount_centavos: number | null;
  cash_policy_approved_at: string | null;
  id_enabled: boolean;
  id_legal_approved_at: string | null;
  id_legal_reference: string;
  accepted_document_types: unknown;
  collection_instructions: string;
  return_instructions: string;
  dispute_instructions: string;
  partial_cash_return_allowed: boolean;
  updated_at: string;
  updated_by: string | null;
};
export type BookingDeposit = {
  booking_id: string;
  option: DepositOption;
  required_centavos: number;
  document_type: string | null;
  partial_return_allowed: boolean;
  collection_instructions: string;
  return_instructions: string;
  dispute_instructions: string;
  policy_version: string;
  legal_reference: string | null;
  request_fingerprint: string;
  is_test: boolean;
  created_at: string;
};
export type DepositEvent = {
  id: string;
  sequence: number;
  booking_id: string;
  event_type:
    | "cash_collected"
    | "cash_returned"
    | "id_received"
    | "id_returned"
    | "case_opened"
    | "case_resolved";
  amount_centavos: number;
  occurred_at: string;
  recorded_at: string;
  recorded_by: string;
  notes: string;
  idempotency_key: string;
  request_fingerprint: unknown;
  is_test: boolean;
};
export type RentalInspection = {
  id: string;
  booking_id: string;
  kind: "handover" | "return";
  occurred_at: string;
  recorded_at: string;
  recorded_by: string;
  odometer_km: number;
  fuel_percent: number;
  condition_notes: string;
  accessories_notes: string;
  existing_damage_notes: string;
  new_damage_notes: string;
  identity_checked: boolean;
  accessories_checked: boolean;
  idempotency_key: string;
  request_fingerprint: unknown;
  is_test: boolean;
};

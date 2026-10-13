import type {
  DepositSettings,
  BookingDeposit,
  DepositEvent,
  RentalInspection,
} from "./rental";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  public: {
    Tables: {
      security_deposit_settings: {
        Row: DepositSettings;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      booking_deposits: {
        Row: BookingDeposit;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      security_deposit_events: {
        Row: DepositEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      rental_inspections: {
        Row: RentalInspection;
        Insert: never;
        Update: never;
        Relationships: [];
      };

      motorcycle_models: {
        Row: Timestamps & {
          id: string;
          slug: string;
          brand: string;
          model_name: string;
          display_name: string;
          engine_cc: number | null;
          description: string | null;
          generation: string | null;
          archived_at: string | null;
          exact_model_name: string | null;
          model_year: string | null;
          transmission: string | null;
          fuel_tank_capacity_liters: number | null;
          cooling_system: string | null;
          starting_system: string | null;
          braking_system: string | null;
          category: string | null;
          notable_features: Json;
          specification_status: string;
          specification_note: string;
          specification_source_url: string | null;
          daily_rate_php: number;
          is_published: boolean;
        };
        Insert: {
          id?: string;
          slug: string;
          brand: string;
          model_name: string;
          display_name: string;
          engine_cc?: number | null;
          description?: string | null;
          generation?: string | null;
          archived_at?: string | null;
          exact_model_name?: string | null;
          model_year?: string | null;
          transmission?: string | null;
          fuel_tank_capacity_liters?: number | null;
          cooling_system?: string | null;
          starting_system?: string | null;
          braking_system?: string | null;
          category?: string | null;
          notable_features?: Json;
          specification_status?: string;
          specification_note?: string;
          specification_source_url?: string | null;
          daily_rate_php: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["motorcycle_models"]["Insert"]
        >;
        Relationships: [];
      };
      motorcycle_units: {
        Row: Timestamps & {
          id: string;
          motorcycle_model_id: string;
          internal_unit_code: string;
          registration_plate: string | null;
          status: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          motorcycle_model_id: string;
          internal_unit_code: string;
          registration_plate?: string | null;
          status?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["motorcycle_units"]["Insert"]
        >;
        Relationships: [];
      };
      customers: {
        Row: Timestamps & {
          id: string;
          auth_user_id: string | null;
          full_name: string;
          email: string | null;
          phone: string | null;
          country_of_residence: string | null;
          customer_type: string | null;
          notes: string | null;
          is_test: boolean;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          country_of_residence?: string | null;
          customer_type?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      bookings: {
        Row: Timestamps & {
          id: string;
          booking_reference: string;
          customer_id: string;
          motorcycle_unit_id: string | null;
          motorcycle_model_id: string | null;
          start_at: string;
          end_at: string;
          status: string;
          quoted_total_php: number;
          pricing_daily_rate_php: number | null;
          pricing_units: number | null;
          submitted_at: string | null;
          approved_by: string | null;
          handover_at: string | null;
          handover_by: string | null;
          returned_at: string | null;
          returned_by: string | null;
          idempotency_key: string | null;
          expires_at: string | null;
          status_reason: string | null;
          is_test: boolean;
          total_centavos: number;
          deposit_required_centavos: number;
          base_total_php: number;
          extras_total_php: number;
        };
        Insert: {
          id?: string;
          booking_reference: string;
          customer_id: string;
          motorcycle_unit_id?: string | null;
          motorcycle_model_id?: string | null;
          start_at: string;
          end_at: string;
          status?: string;
          quoted_total_php: number;
          pricing_daily_rate_php?: number | null;
          pricing_units?: number | null;
          submitted_at?: string | null;
          approved_by?: string | null;
          handover_at?: string | null;
          handover_by?: string | null;
          returned_at?: string | null;
          returned_by?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
        Relationships: [];
      };
      booking_extras_catalog: {
        Row: Timestamps & {
          id: string;
          name: string;
          description: string | null;
          price_php: number;
          price_centavos: number;
          is_available: boolean;
          is_active: boolean;
          pricing_model: string;
          total_quantity: number;
          max_per_booking: number;
          image_path: string | null;
          display_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price_php: number;
          is_available?: boolean;
          display_order?: number;
          is_active?: boolean;
          pricing_model?: string;
          total_quantity?: number;
          max_per_booking?: number;
          image_path?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["booking_extras_catalog"]["Insert"]
        >;
        Relationships: [];
      };
      booking_extra_items: {
        Row: {
          id: string;
          booking_id: string;
          extra_id: string | null;
          name_snapshot: string;
          price_php_snapshot: number;
          quantity: number;
          pricing_model_snapshot: string;
          charged_units: number;
          unit_price_centavos_snapshot: number;
          line_total_centavos: number;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      booking_status_history: {
        Row: {
          id: string;
          booking_id: string;
          old_status: string | null;
          new_status: string;
          changed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          old_status?: string | null;
          new_status: string;
          changed_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["booking_status_history"]["Insert"]
        >;
        Relationships: [];
      };
      pricing_rules: {
        Row: {
          id: string;
          motorcycle_model_id: string;
          rule_name: string;
          pricing_type: string;
          amount_php: number;
          valid_from: string | null;
          valid_until: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          motorcycle_model_id: string;
          rule_name: string;
          pricing_type: string;
          amount_php: number;
          valid_from?: string | null;
          valid_until?: string | null;
          is_active?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["pricing_rules"]["Insert"]
        >;
        Relationships: [];
      };
      motorcycle_unavailability: {
        Row: {
          id: string;
          motorcycle_unit_id: string;
          start_at: string;
          end_at: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          motorcycle_unit_id: string;
          start_at: string;
          end_at: string;
          reason: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["motorcycle_unavailability"]["Insert"]
        >;
        Relationships: [];
      };
      motorcycle_media: {
        Row: {
          id: string;
          motorcycle_model_id: string;
          storage_path: string;
          alt_text: string;
          sort_order: number;
          media_kind: string;
          license_status: string;
          license_source_url: string | null;
          license_note: string | null;
          verification_status: string;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          motorcycle_model_id: string;
          storage_path: string;
          alt_text: string;
          sort_order?: number;
          media_kind?: string;
          license_status?: string;
          license_source_url?: string | null;
          license_note?: string | null;
          verification_status?: string;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["motorcycle_media"]["Insert"]
        >;
        Relationships: [];
      };
      booking_settings: {
        Row: {
          id: boolean;
          timezone: string;
          operating_hours: Json | null;
          partial_day_policy: string | null;
          pending_hold_minutes: number | null;
          accepted_philippine_id_types: Json;
          international_policy_source_url: string | null;
          international_policy_verified_at: string | null;
          privacy_notice: string | null;
          retention_policy: string | null;
          public_booking_enabled: boolean;
          partial_day_pricing_policy: string | null;
          pending_expiration_minutes: number | null;
          philippine_license_policy: string | null;
          international_license_policy: string | null;
          international_manual_review_required: boolean;
          policies_approved_at: string | null;
          policies_approved_by: string | null;
          updated_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["booking_settings"]["Row"]
        >;
        Update: Partial<
          Database["public"]["Tables"]["booking_settings"]["Row"]
        >;
        Relationships: [];
      };
      customer_verifications: {
        Row: {
          id: string;
          booking_id: string;
          customer_id: string;
          customer_type: string;
          identity_status: string;
          license_status: string;
          entitlement_status: string;
          international_status: string;
          overall_status: string;
          license_issuing_country: string | null;
          license_expiration_date: string | null;
          permitted_vehicle_categories: string | null;
          philippines_entry_date: string | null;
          identity_name: string | null;
          license_name: string | null;
          customer_declaration_at: string | null;
          privacy_consent_at: string | null;
          reviewer_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["customer_verifications"]["Row"]
        > & { booking_id: string; customer_id: string; customer_type: string };
        Update: Partial<
          Database["public"]["Tables"]["customer_verifications"]["Row"]
        >;
        Relationships: [];
      };
      verification_documents: {
        Row: {
          id: string;
          verification_id: string;
          booking_id: string;
          owner_user_id: string;
          document_kind: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          status: string;
          replaced_at: string | null;
          is_test: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          verification_id: string;
          booking_id: string;
          owner_user_id: string;
          document_kind: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number;
          status?: string;
          replaced_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["verification_documents"]["Row"]
        >;
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          auth_user_id: string;
          role: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          role: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          payment_provider: string;
          provider_reference: string | null;
          amount_php: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          payment_provider: string;
          provider_reference?: string | null;
          amount_php: number;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      booking_inventory_holds: {
        Row: {
          id: string;
          booking_id: string;
          motorcycle_unit_id: string;
          start_at: string;
          end_at: string;
          expires_at: string;
          released_at: string | null;
          converted_at: string | null;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_verification_resubmission_instructions: {
        Args: { p_booking_id: string };
        Returns: string | null;
      };
      abandon_booking_request: {
        Args: { p_booking_id: string };
        Returns: undefined;
      };
      get_model_slot_availability: {
        Args: { p_model_id: string; p_periods: Json };
        Returns: { slot_key: string; available_count: number }[];
      };
      finalize_booking_request: {
        Args: {
          p_booking_id: string;
          p_terms_version: string;
          p_terms_accepted: boolean;
        };
        Returns: { booking_status: string; verification_status: string }[];
      };
      register_verification_resubmission: {
        Args: {
          p_booking_id: string;
          p_document_kind: string;
          p_storage_path: string;
          p_mime_type: string;
          p_size_bytes: number;
        };
        Returns: string;
      };

      get_security_deposit_options: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_save_security_deposit_settings: {
        Args: { p_settings: Json };
        Returns: undefined;
      };
      get_booking_deposit_summary: {
        Args: { p_booking_id: string };
        Returns: Json;
      };
      get_booking_quote_v3: {
        Args: {
          p_model_id: string;
          p_start_at: string;
          p_end_at: string;
          p_extra_items: Json;
          p_deposit_option: string;
          p_document_type?: string | null;
        };
        Returns: (Database["public"]["Functions"]["get_booking_quote_v2"]["Returns"][number] & {
          cash_due_at_pickup_centavos: number;
          policy_version: string;
        })[];
      };
      submit_booking_request_v3: {
        Args: Database["public"]["Functions"]["submit_booking_request_v2"]["Args"] & {
          p_deposit_option: string;
          p_policy_version: string;
          p_document_type?: string | null;
        };
        Returns: (Database["public"]["Functions"]["submit_booking_request_v2"]["Returns"][number] & {
          rental_total_centavos: number;
          deposit_required_centavos: number;
          cash_due_at_pickup_centavos: number;
        })[];
      };
      admin_record_security_deposit_event: {
        Args: {
          p_booking_id: string;
          p_event_type: string;
          p_amount_centavos: number;
          p_occurred_at: string;
          p_notes: string;
          p_idempotency_key: string;
          p_verified: boolean;
        };
        Returns: string;
      };
      admin_record_rental_inspection: {
        Args: {
          p_booking_id: string;
          p_kind: string;
          p_details: Json;
          p_idempotency_key: string;
        };
        Returns: string;
      };

      can_use_booking_testing: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_booking_quote: {
        Args: { p_model_id: string; p_start_at: string; p_end_at: string };
        Returns: {
          pricing_units: number;
          daily_rate_php: number;
          total_php: number;
        }[];
      };
      get_booking_quote_with_extras: {
        Args: {
          p_model_id: string;
          p_start_at: string;
          p_end_at: string;
          p_extra_ids?: string[];
        };
        Returns: {
          pricing_units: number;
          daily_rate_php: number;
          base_total_php: number;
          extras_total_php: number;
          total_php: number;
        }[];
      };
      get_booking_quote_v2: {
        Args: {
          p_model_id: string;
          p_start_at: string;
          p_end_at: string;
          p_extra_items?: Json;
        };
        Returns: {
          pricing_units: number;
          daily_rate_php: number;
          base_total_centavos: number;
          extras_total_centavos: number;
          fees_total_centavos: number;
          deposit_required_centavos: number | null;
          rental_workflow_version?: number;
          total_centavos: number;
        }[];
      };
      check_model_availability: {
        Args: { p_model_id: string; p_start_at: string; p_end_at: string };
        Returns: number;
      };
      submit_booking_request: {
        Args: {
          p_idempotency_key: string;
          p_model_id: string;
          p_start_at: string;
          p_end_at: string;
          p_full_name: string;
          p_email: string;
          p_phone: string;
          p_country: string;
          p_customer_type: string;
          p_identity_name: string;
          p_license_name: string;
          p_license_country: string;
          p_license_expiration: string;
          p_vehicle_categories: string;
          p_entry_date: string | null;
          p_privacy_consent: boolean;
          p_declaration: boolean;
        };
        Returns: {
          booking_id: string;
          booking_reference: string;
          verification_id: string;
        }[];
      };
      submit_booking_request_with_extras: {
        Args: Database["public"]["Functions"]["submit_booking_request"]["Args"] & {
          p_extra_ids: string[];
        };
        Returns: Database["public"]["Functions"]["submit_booking_request"]["Returns"];
      };
      submit_booking_request_v2: {
        Args: Omit<
          Database["public"]["Functions"]["submit_booking_request"]["Args"],
          never
        > & { p_extra_items: Json };
        Returns: Database["public"]["Functions"]["submit_booking_request"]["Returns"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'no_show';

export type PaymentStatus = 'submitted' | 'confirmed' | 'rejected';
export type PaymentMethod = 'instapay' | 'vodafone_cash' | 'cash';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          is_blocked: boolean;
          is_admin: boolean;
          language: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          is_blocked?: boolean;
          is_admin?: boolean;
          language?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          is_blocked?: boolean;
          is_admin?: boolean;
          language?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          user_id: string;
          service_id: string;
          service_name_ar: string;
          service_name_en: string;
          price_egp: number;
          duration_minutes: number;
          start_at: string;
          end_at: string;
          status: BookingStatus;
          hold_expires_at: string | null;
          reminder_sent_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'bookings_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'bookings_service_id_fkey'; columns: ['service_id']; referencedRelation: 'services'; referencedColumns: ['id'] },
        ];
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          user_id: string;
          amount_egp: number;
          method: PaymentMethod;
          status: PaymentStatus;
          proof_path: string | null;
          transaction_ref: string | null;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: 'payments_booking_id_fkey'; columns: ['booking_id']; referencedRelation: 'bookings'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      services: {
        Row: {
          id: string;
          name_ar: string;
          name_en: string;
          price_egp: number;
          duration_minutes: number;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name_ar: string;
          name_en: string;
          price_egp: number;
          duration_minutes: number;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name_ar?: string;
          name_en?: string;
          price_egp?: number;
          duration_minutes?: number;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      working_hours: {
        Row: {
          id: string;
          day_of_week: number;
          is_closed: boolean;
          open_time: string;
          close_time: string;
          last_slot_start: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          day_of_week: number;
          is_closed?: boolean;
          open_time: string;
          close_time: string;
          last_slot_start: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          day_of_week?: number;
          is_closed?: boolean;
          open_time?: string;
          close_time?: string;
          last_slot_start?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      time_off: {
        Row: {
          id: string;
          start_at: string;
          end_at: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          start_at: string;
          end_at: string;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          start_at?: string;
          end_at?: string;
          reason?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: number;
          slot_step_min: number;
          min_hours_before: number;
          max_days_ahead: number;
          cancel_window_hours: number;
          hold_minutes: number;
          max_active_pending_per_user: number;
          auto_complete: boolean;
          auto_confirm_payment: boolean;
          auto_reminders: boolean;
          reminder_minutes_before: number;
          allow_pay_at_shop: boolean;
          instapay_number: string | null;
          vodafone_cash_number: string | null;
          payment_note_ar: string | null;
          payment_note_en: string | null;
          shop_name: string;
          shop_whatsapp: string | null;
          timezone: string;
          reminder_template_ar: string;
          reminder_template_en: string;
          confirmation_template_ar: string;
          confirmation_template_en: string;
          cancellation_template_ar: string;
          cancellation_template_en: string;
          booking_open: boolean;
          updated_at: string;
        };
        Insert: never;
        Update: {
          slot_step_min?: number;
          min_hours_before?: number;
          max_days_ahead?: number;
          cancel_window_hours?: number;
          hold_minutes?: number;
          max_active_pending_per_user?: number;
          auto_complete?: boolean;
          auto_confirm_payment?: boolean;
          auto_reminders?: boolean;
          reminder_minutes_before?: number;
          allow_pay_at_shop?: boolean;
          instapay_number?: string | null;
          vodafone_cash_number?: string | null;
          payment_note_ar?: string | null;
          payment_note_en?: string | null;
          shop_name?: string;
          shop_whatsapp?: string | null;
          reminder_template_ar?: string;
          reminder_template_en?: string;
          confirmation_template_ar?: string;
          confirmation_template_en?: string;
          cancellation_template_ar?: string;
          cancellation_template_en?: string;
          booking_open?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_secrets: {
        Row: {
          id: number;
          wa_phone_number_id: string | null;
          wa_access_token: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          wa_phone_number_id?: string | null;
          wa_access_token?: string | null;
          updated_at?: string;
        };
        Update: {
          wa_phone_number_id?: string | null;
          wa_access_token?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          id: string;
          actor_id: string;
          action: string;
          entity: string;
          entity_id: string;
          meta: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      admin_confirm_payment: { Args: { p_payment_id: string }; Returns: Json };
      admin_reject_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: Json;
      };
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string };
        Returns: Json;
      };
      admin_set_booking_status: {
        Args: { p_booking_id: string; p_status: BookingStatus };
        Returns: Json;
      };
      admin_create_booking: {
        Args: {
          p_name: string;
          p_phone: string;
          p_service_id: string;
          p_start_at: string;
          p_paid_cash?: boolean;
        };
        Returns: Json;
      };
      admin_block_user: {
        Args: { p_user_id: string; p_blocked: boolean };
        Returns: Json;
      };
      admin_mark_reminder_sent: {
        Args: { p_booking_id: string };
        Returns: Json;
      };
      admin_dashboard_stats: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      admin_search_customers: {
        Args: { p_q: string; p_limit: number; p_offset: number };
        Returns: Json;
      };
      get_available_slots: {
        Args: { p_date: string; p_service_id: string };
        Returns: Json;
      };
      admin_cleanup_old_proofs: {
        Args: { p_dry_run?: boolean };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Booking = Database['public']['Tables']['bookings']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type Service = Database['public']['Tables']['services']['Row'];
export type WorkingHours = Database['public']['Tables']['working_hours']['Row'];
export type TimeOff = Database['public']['Tables']['time_off']['Row'];
export type Settings = Database['public']['Tables']['settings']['Row'];

export type BookingWithRelations = Booking & {
  profile?: Pick<Profile, 'full_name' | 'phone'> | Pick<Profile, 'full_name' | 'phone'>[] | null;
  payment?: Payment | Payment[] | null;
};

export type PaymentWithBooking = Payment & {
  booking?: Booking | null;
  profile?: Pick<Profile, 'full_name' | 'phone'> | null;
};

export type DashboardStats = {
  bookings_count: number;
  pending_payment_count: number;
  confirmed_income: number;
  no_show_count: number;
  top_services: Array<{ name: string; count: number }>;
};

export type CustomerSearchResult = {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_blocked: boolean;
  total_bookings: number;
  completed_count: number;
  no_show_count: number;
  last_visit: string | null;
};

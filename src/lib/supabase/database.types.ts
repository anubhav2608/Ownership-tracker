export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      document_links: {
        Row: {
          created_at: string;
          document_id: string;
          id: string;
          item_id: string | null;
          order_id: string | null;
          service_event_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document_id: string;
          id?: string;
          item_id?: string | null;
          order_id?: string | null;
          service_event_id?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          id?: string;
          item_id?: string | null;
          order_id?: string | null;
          service_event_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_user_id_fkey";
            columns: ["document_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "document_links_item_id_user_id_fkey";
            columns: ["item_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "document_links_order_id_user_id_fkey";
            columns: ["order_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "document_links_service_event_id_user_id_fkey";
            columns: ["service_event_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "service_events";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          import_id: string | null;
          kind: Database["public"]["Enums"]["document_kind"];
          mime_type: string;
          sha256: string | null;
          size_bytes: number;
          source: Database["public"]["Enums"]["record_source"];
          storage_path: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          import_id?: string | null;
          kind?: Database["public"]["Enums"]["document_kind"];
          mime_type: string;
          sha256?: string | null;
          size_bytes: number;
          source: Database["public"]["Enums"]["record_source"];
          storage_path: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          import_id?: string | null;
          kind?: Database["public"]["Enums"]["document_kind"];
          mime_type?: string;
          sha256?: string | null;
          size_bytes?: number;
          source?: Database["public"]["Enums"]["record_source"];
          storage_path?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_import_id_user_id_fkey";
            columns: ["import_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "imports";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      imports: {
        Row: {
          attempts: number;
          candidates: NonNullable<Json>;
          content_sha256: string | null;
          created_at: string;
          document_kind: Database["public"]["Enums"]["document_kind"] | null;
          duplicate_of: string | null;
          error: Json | null;
          extracted: NonNullable<Json>;
          from_email: string | null;
          inbound_event_id: string | null;
          id: string;
          message_id: string | null;
          next_attempt_at: string | null;
          parser: string | null;
          raw_storage_path: string | null;
          received_at: string;
          result: Json | null;
          review_reasons: string[];
          source: Database["public"]["Enums"]["record_source"];
          stage: Database["public"]["Enums"]["import_stage"];
          status: Database["public"]["Enums"]["import_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          candidates?: NonNullable<Json>;
          content_sha256?: string | null;
          created_at?: string;
          document_kind?: Database["public"]["Enums"]["document_kind"] | null;
          duplicate_of?: string | null;
          error?: Json | null;
          extracted?: NonNullable<Json>;
          from_email?: string | null;
          inbound_event_id?: string | null;
          id?: string;
          message_id?: string | null;
          next_attempt_at?: string | null;
          parser?: string | null;
          raw_storage_path?: string | null;
          received_at?: string;
          result?: Json | null;
          review_reasons?: string[];
          source: Database["public"]["Enums"]["record_source"];
          stage?: Database["public"]["Enums"]["import_stage"];
          status?: Database["public"]["Enums"]["import_status"];
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          attempts?: number;
          candidates?: NonNullable<Json>;
          content_sha256?: string | null;
          created_at?: string;
          document_kind?: Database["public"]["Enums"]["document_kind"] | null;
          duplicate_of?: string | null;
          error?: Json | null;
          extracted?: NonNullable<Json>;
          from_email?: string | null;
          inbound_event_id?: string | null;
          id?: string;
          message_id?: string | null;
          next_attempt_at?: string | null;
          parser?: string | null;
          raw_storage_path?: string | null;
          received_at?: string;
          result?: Json | null;
          review_reasons?: string[];
          source?: Database["public"]["Enums"]["record_source"];
          stage?: Database["public"]["Enums"]["import_stage"];
          status?: Database["public"]["Enums"]["import_status"];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "imports_duplicate_of_user_id_fkey";
            columns: ["duplicate_of", "user_id"];
            isOneToOne: false;
            referencedRelation: "imports";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      items: {
        Row: {
          brand: string | null;
          category: Database["public"]["Enums"]["item_category"];
          created_at: string;
          currency: string;
          field_meta: NonNullable<Json>;
          id: string;
          identifiers: NonNullable<Json>;
          model: string | null;
          name: string;
          notes: string | null;
          order_id: string | null;
          price: number | null;
          purchase_date: string | null;
          search_text: string | null;
          status: Database["public"]["Enums"]["item_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand?: string | null;
          category: Database["public"]["Enums"]["item_category"];
          created_at?: string;
          currency?: string;
          field_meta?: NonNullable<Json>;
          id?: string;
          identifiers?: NonNullable<Json>;
          model?: string | null;
          name: string;
          notes?: string | null;
          order_id?: string | null;
          price?: number | null;
          purchase_date?: string | null;
          search_text?: never;
          status?: Database["public"]["Enums"]["item_status"];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          brand?: string | null;
          category?: Database["public"]["Enums"]["item_category"];
          created_at?: string;
          currency?: string;
          field_meta?: NonNullable<Json>;
          id?: string;
          identifiers?: NonNullable<Json>;
          model?: string | null;
          name?: string;
          notes?: string | null;
          order_id?: string | null;
          price?: number | null;
          purchase_date?: string | null;
          search_text?: never;
          status?: Database["public"]["Enums"]["item_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_order_id_user_id_fkey";
            columns: ["order_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      orders: {
        Row: {
          created_at: string;
          currency: string;
          field_meta: NonNullable<Json>;
          id: string;
          import_id: string | null;
          merchant: string;
          order_date: string | null;
          invoice_ref: string | null;
          order_ref: string | null;
          refunded_amount: number | null;
          source: Database["public"]["Enums"]["record_source"];
          status: Database["public"]["Enums"]["order_status"];
          total: number | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          currency?: string;
          field_meta?: NonNullable<Json>;
          id?: string;
          import_id?: string | null;
          merchant: string;
          order_date?: string | null;
          invoice_ref?: string | null;
          order_ref?: string | null;
          refunded_amount?: number | null;
          source: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["order_status"];
          total?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          field_meta?: NonNullable<Json>;
          id?: string;
          import_id?: string | null;
          merchant?: string;
          order_date?: string | null;
          invoice_ref?: string | null;
          order_ref?: string | null;
          refunded_amount?: number | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["order_status"];
          total?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_import_id_user_id_fkey";
            columns: ["import_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "imports";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          forwarding_token: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          forwarding_token?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          forwarding_token?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_event_parts: {
        Row: {
          cost: number | null;
          id: string;
          name: string;
          position: number;
          service_event_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          cost?: number | null;
          id?: string;
          name: string;
          position?: number;
          service_event_id: string;
          user_id?: string;
        };
        Update: {
          cost?: number | null;
          id?: string;
          name?: string;
          position?: number;
          service_event_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_event_parts_service_event_id_user_id_fkey";
            columns: ["service_event_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "service_events";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      service_events: {
        Row: {
          created_at: string;
          currency: string;
          document_id: string | null;
          field_meta: NonNullable<Json>;
          id: string;
          import_id: string | null;
          item_id: string;
          labour_cost: number | null;
          notes: string | null;
          odometer_km: number | null;
          provider: string | null;
          service_date: string;
          total_cost: number;
          updated_at: string;
          user_id: string;
          work_performed: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          currency?: string;
          document_id?: string | null;
          field_meta?: NonNullable<Json>;
          id?: string;
          import_id?: string | null;
          item_id: string;
          labour_cost?: number | null;
          notes?: string | null;
          odometer_km?: number | null;
          provider?: string | null;
          service_date: string;
          total_cost?: number;
          updated_at?: string;
          user_id?: string;
          work_performed: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          document_id?: string | null;
          field_meta?: NonNullable<Json>;
          id?: string;
          import_id?: string | null;
          item_id?: string;
          labour_cost?: number | null;
          notes?: string | null;
          odometer_km?: number | null;
          provider?: string | null;
          service_date?: string;
          total_cost?: number;
          updated_at?: string;
          user_id?: string;
          work_performed?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_events_document_id_user_id_fkey";
            columns: ["document_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "service_events_import_id_user_id_fkey";
            columns: ["import_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "imports";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "service_events_item_id_user_id_fkey";
            columns: ["item_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      verified_senders: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          user_id: string;
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      warranties: {
        Row: {
          created_at: string;
          document_id: string | null;
          evidence: string | null;
          expires_on: string;
          item_id: string;
          months: number;
          provider: string | null;
          starts_on: string;
          state: Database["public"]["Enums"]["field_state"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document_id?: string | null;
          evidence?: string | null;
          expires_on: string;
          item_id: string;
          months: number;
          provider?: string | null;
          starts_on: string;
          state: Database["public"]["Enums"]["field_state"];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          document_id?: string | null;
          evidence?: string | null;
          expires_on?: string;
          item_id?: string;
          months?: number;
          provider?: string | null;
          starts_on?: string;
          state?: Database["public"]["Enums"]["field_state"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warranties_document_id_user_id_fkey";
            columns: ["document_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "warranties_item_id_user_id_fkey";
            columns: ["item_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_import_sender: { Args: { import_id: string }; Returns: string };
      create_manual_purchase: { Args: { purchase: Json }; Returns: Json };
      create_manual_service_event: { Args: { event: Json }; Returns: Json };
      is_valid_field_meta: { Args: { meta: Json }; Returns: boolean };
      link_import_documents: {
        Args: {
          import_id: string;
          item_ids?: string[];
          order_id?: string;
          service_event_id?: string;
        };
        Returns: undefined;
      };
      mark_import_saved: {
        Args: { import_id: string; result: Json };
        Returns: undefined;
      };
      record_import_result: {
        Args: { import_id: string; outcome: Json };
        Returns: undefined;
      };
      regenerate_forwarding_token: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      retry_import: {
        Args: { import_id: string };
        Returns: {
          attempts: number;
          candidates: NonNullable<Json>;
          content_sha256: string | null;
          created_at: string;
          document_kind: Database["public"]["Enums"]["document_kind"] | null;
          duplicate_of: string | null;
          error: Json | null;
          extracted: NonNullable<Json>;
          from_email: string | null;
          id: string;
          message_id: string | null;
          next_attempt_at: string | null;
          parser: string | null;
          raw_storage_path: string | null;
          received_at: string;
          result: Json | null;
          review_reasons: string[];
          source: Database["public"]["Enums"]["record_source"];
          stage: Database["public"]["Enums"]["import_stage"];
          status: Database["public"]["Enums"]["import_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "imports";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_import_processing: {
        Args: { import_id: string };
        Returns: boolean;
      };
      update_service_event: {
        Args: { event: Json; event_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      document_kind:
        | "order_confirmation"
        | "invoice"
        | "refund_notice"
        | "service_receipt"
        | "warranty_card"
        | "other";
      field_state: "missing" | "extracted" | "confirmed";
      import_stage:
        | "received"
        | "verified"
        | "text_extracted"
        | "parsed"
        | "validated"
        | "matched"
        | "saved";
      import_status:
        | "queued"
        | "processing"
        | "needs_review"
        | "imported"
        | "duplicate"
        | "unsupported"
        | "failed";
      item_category:
        | "electronics"
        | "appliances"
        | "vehicle"
        | "furniture"
        | "clothing"
        | "accessories"
        | "home"
        | "other";
      item_status: "owned" | "returned" | "sold" | "disposed";
      order_status: "completed" | "refunded" | "partially_refunded";
      record_source: "email" | "upload" | "manual";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      document_kind: [
        "order_confirmation",
        "invoice",
        "refund_notice",
        "service_receipt",
        "warranty_card",
        "other",
      ],
      field_state: ["missing", "extracted", "confirmed"],
      import_stage: [
        "received",
        "verified",
        "text_extracted",
        "parsed",
        "validated",
        "matched",
        "saved",
      ],
      import_status: [
        "queued",
        "processing",
        "needs_review",
        "imported",
        "duplicate",
        "unsupported",
        "failed",
      ],
      item_category: [
        "electronics",
        "appliances",
        "vehicle",
        "furniture",
        "clothing",
        "accessories",
        "home",
        "other",
      ],
      item_status: ["owned", "returned", "sold", "disposed"],
      order_status: ["completed", "refunded", "partially_refunded"],
      record_source: ["email", "upload", "manual"],
    },
  },
} as const;

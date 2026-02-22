export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      corporate_groups: {
        Row: {
          corporate_group_name: string
          corporate_id: string
          created_at: string
        }
        Insert: {
          corporate_group_name: string
          corporate_id?: string
          created_at?: string
        }
        Update: {
          corporate_group_name?: string
          corporate_id?: string
          created_at?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          corporate_id: string
          created_at: string
          entity_id: string
          legal_entity_name: string
        }
        Insert: {
          corporate_id: string
          created_at?: string
          entity_id?: string
          legal_entity_name: string
        }
        Update: {
          corporate_id?: string
          created_at?: string
          entity_id?: string
          legal_entity_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_corporate_id_fkey"
            columns: ["corporate_id"]
            isOneToOne: false
            referencedRelation: "corporate_groups"
            referencedColumns: ["corporate_id"]
          },
        ]
      }
      leases: {
        Row: {
          asset_unit: string
          concerned_person: string
          created_at: string
          discount_rate_ibr: number
          entity_id: string
          escalations: Json
          initial_direct_cost: number
          lease_comments: string
          lease_end_date: string
          lease_event: string
          lease_id: string
          lease_name: string
          lease_start_date: string
          lease_type: string
          lease_version: number
          legal_entity_name: string
          low_value_flag: boolean
          modifications: Json
          monthly_lease_amount: number
          number_installments: number
          payment_frequency: string
          rent_commencement_date: string
          security_deposit: number
          short_term_flag: boolean
          status: string
          tagged_employee: string
          vendor_name: string
        }
        Insert: {
          asset_unit?: string
          concerned_person?: string
          created_at?: string
          discount_rate_ibr?: number
          entity_id: string
          escalations?: Json
          initial_direct_cost?: number
          lease_comments?: string
          lease_end_date: string
          lease_event?: string
          lease_id?: string
          lease_name: string
          lease_start_date: string
          lease_type?: string
          lease_version?: number
          legal_entity_name?: string
          low_value_flag?: boolean
          modifications?: Json
          monthly_lease_amount?: number
          number_installments?: number
          payment_frequency?: string
          rent_commencement_date: string
          security_deposit?: number
          short_term_flag?: boolean
          status?: string
          tagged_employee?: string
          vendor_name?: string
        }
        Update: {
          asset_unit?: string
          concerned_person?: string
          created_at?: string
          discount_rate_ibr?: number
          entity_id?: string
          escalations?: Json
          initial_direct_cost?: number
          lease_comments?: string
          lease_end_date?: string
          lease_event?: string
          lease_id?: string
          lease_name?: string
          lease_start_date?: string
          lease_type?: string
          lease_version?: number
          legal_entity_name?: string
          low_value_flag?: boolean
          modifications?: Json
          monthly_lease_amount?: number
          number_installments?: number
          payment_frequency?: string
          rent_commencement_date?: string
          security_deposit?: number
          short_term_flag?: boolean
          status?: string
          tagged_employee?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["entity_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

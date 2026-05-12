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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          rule_json: Json
          symbol: string
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          rule_json: Json
          symbol: string
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          rule_json?: Json
          symbol?: string
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backtests: {
        Row: {
          equity_curve_json: Json
          id: string
          metrics_json: Json
          ran_at: string
          strategy_id: string | null
          symbol: string
          timeframe: string
          user_id: string
        }
        Insert: {
          equity_curve_json?: Json
          id?: string
          metrics_json?: Json
          ran_at?: string
          strategy_id?: string | null
          symbol: string
          timeframe: string
          user_id: string
        }
        Update: {
          equity_curve_json?: Json
          id?: string
          metrics_json?: Json
          ran_at?: string
          strategy_id?: string | null
          symbol?: string
          timeframe?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtests_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      news_cache: {
        Row: {
          headline: string
          id: string
          published_at: string
          sentiment: string | null
          source: string | null
          symbol: string | null
          url: string | null
        }
        Insert: {
          headline: string
          id?: string
          published_at?: string
          sentiment?: string | null
          source?: string | null
          symbol?: string | null
          url?: string | null
        }
        Update: {
          headline?: string
          id?: string
          published_at?: string
          sentiment?: string | null
          source?: string | null
          symbol?: string | null
          url?: string | null
        }
        Relationships: []
      }
      paper_accounts: {
        Row: {
          cash: number
          created_at: string
          equity: number
          id: string
          user_id: string
        }
        Insert: {
          cash?: number
          created_at?: string
          equity?: number
          id?: string
          user_id: string
        }
        Update: {
          cash?: number
          created_at?: string
          equity?: number
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      paper_orders: {
        Row: {
          account_id: string
          created_at: string
          filled_at: string | null
          filled_price: number | null
          id: string
          limit_price: number | null
          price: number | null
          qty: number
          side: string
          status: string
          stop_loss: number | null
          stop_price: number | null
          symbol: string
          take_profit: number | null
          trail_anchor: number | null
          trailing_pct: number | null
          type: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          filled_at?: string | null
          filled_price?: number | null
          id?: string
          limit_price?: number | null
          price?: number | null
          qty: number
          side: string
          status?: string
          stop_loss?: number | null
          stop_price?: number | null
          symbol: string
          take_profit?: number | null
          trail_anchor?: number | null
          trailing_pct?: number | null
          type?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          filled_at?: string | null
          filled_price?: number | null
          id?: string
          limit_price?: number | null
          price?: number | null
          qty?: number
          side?: string
          status?: string
          stop_loss?: number | null
          stop_price?: number | null
          symbol?: string
          take_profit?: number | null
          trail_anchor?: number | null
          trailing_pct?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_positions: {
        Row: {
          account_id: string
          avg_price: number
          id: string
          opened_at: string
          qty: number
          symbol: string
          user_id: string
        }
        Insert: {
          account_id: string
          avg_price: number
          id?: string
          opened_at?: string
          qty: number
          symbol: string
          user_id: string
        }
        Update: {
          account_id?: string
          avg_price?: number
          id?: string
          opened_at?: string
          qty?: number
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_holdings: {
        Row: {
          avg_price: number
          id: string
          opened_at: string
          qty: number
          symbol: string
          user_id: string
        }
        Insert: {
          avg_price: number
          id?: string
          opened_at?: string
          qty: number
          symbol: string
          user_id: string
        }
        Update: {
          avg_price?: number
          id?: string
          opened_at?: string
          qty?: number
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      recent_searches: {
        Row: {
          id: string
          searched_at: string
          symbol: string
          user_id: string
        }
        Insert: {
          id?: string
          searched_at?: string
          symbol: string
          user_id: string
        }
        Update: {
          id?: string
          searched_at?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      signals_cache: {
        Row: {
          computed_at: string
          label: string
          reasoning_json: Json
          score: number
          symbol: string
          timeframe: string
        }
        Insert: {
          computed_at?: string
          label: string
          reasoning_json?: Json
          score: number
          symbol: string
          timeframe: string
        }
        Update: {
          computed_at?: string
          label?: string
          reasoning_json?: Json
          score?: number
          symbol?: string
          timeframe?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          ai_generated: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          rules_json: Json
          user_id: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          rules_json?: Json
          user_id: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          rules_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      trade_journal: {
        Row: {
          ai_review: string | null
          created_at: string
          emotion: string | null
          id: string
          notes: string | null
          order_id: string | null
          pnl: number | null
          pnl_pct: number | null
          price: number
          qty: number
          setup: string | null
          side: string
          symbol: string
          tags: string[]
          user_id: string
        }
        Insert: {
          ai_review?: string | null
          created_at?: string
          emotion?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          pnl?: number | null
          pnl_pct?: number | null
          price: number
          qty: number
          setup?: string | null
          side: string
          symbol: string
          tags?: string[]
          user_id: string
        }
        Update: {
          ai_review?: string | null
          created_at?: string
          emotion?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          pnl?: number | null
          pnl_pct?: number | null
          price?: number
          qty?: number
          setup?: string | null
          side?: string
          symbol?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_journal_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "paper_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          added_at: string
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
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
    Enums: {
      app_role: ["admin", "user", "super_admin"],
    },
  },
} as const

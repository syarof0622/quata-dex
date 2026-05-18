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
      news_articles: {
        Row: {
          canonical_url: string | null
          category: string | null
          confidence: number
          created_at: string
          duplicate_of: string | null
          duplicate_sources: string[]
          fetched_at: string
          id: string
          image_url: string | null
          impact_level: string
          impact_score: number
          is_duplicate: boolean
          keywords: string[]
          published_at: string
          raw_payload: Json | null
          related_symbols: string[]
          sectors: string[]
          sentiment: string
          sentiment_score: number
          source: string
          source_id: string
          summary: string | null
          tickers: string[]
          title: string
          title_hash: string | null
          updated_at: string
          url: string
        }
        Insert: {
          canonical_url?: string | null
          category?: string | null
          confidence?: number
          created_at?: string
          duplicate_of?: string | null
          duplicate_sources?: string[]
          fetched_at?: string
          id?: string
          image_url?: string | null
          impact_level?: string
          impact_score?: number
          is_duplicate?: boolean
          keywords?: string[]
          published_at?: string
          raw_payload?: Json | null
          related_symbols?: string[]
          sectors?: string[]
          sentiment?: string
          sentiment_score?: number
          source: string
          source_id: string
          summary?: string | null
          tickers?: string[]
          title: string
          title_hash?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          canonical_url?: string | null
          category?: string | null
          confidence?: number
          created_at?: string
          duplicate_of?: string | null
          duplicate_sources?: string[]
          fetched_at?: string
          id?: string
          image_url?: string | null
          impact_level?: string
          impact_score?: number
          is_duplicate?: boolean
          keywords?: string[]
          published_at?: string
          raw_payload?: Json | null
          related_symbols?: string[]
          sectors?: string[]
          sentiment?: string
          sentiment_score?: number
          source?: string
          source_id?: string
          summary?: string | null
          tickers?: string[]
          title?: string
          title_hash?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
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
      news_price_alignment: {
        Row: {
          alignment: string
          computed_at: string
          confidence: number
          id: string
          news_sentiment: string
          price_direction: string
          reasoning: string | null
          symbol: string
        }
        Insert: {
          alignment: string
          computed_at?: string
          confidence?: number
          id?: string
          news_sentiment: string
          price_direction: string
          reasoning?: string | null
          symbol: string
        }
        Update: {
          alignment?: string
          computed_at?: string
          confidence?: number
          id?: string
          news_sentiment?: string
          price_direction?: string
          reasoning?: string | null
          symbol?: string
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          articles_today: number
          category: string | null
          enabled: boolean
          fail_count: number
          fallback_url: string | null
          id: string
          last_error: string | null
          last_failed_at: string | null
          last_success_at: string | null
          name: string
          priority: number
          status: string
          type: string
          updated_at: string
          url: string
        }
        Insert: {
          articles_today?: number
          category?: string | null
          enabled?: boolean
          fail_count?: number
          fallback_url?: string | null
          id: string
          last_error?: string | null
          last_failed_at?: string | null
          last_success_at?: string | null
          name: string
          priority?: number
          status?: string
          type: string
          updated_at?: string
          url: string
        }
        Update: {
          articles_today?: number
          category?: string | null
          enabled?: boolean
          fail_count?: number
          fallback_url?: string | null
          id?: string
          last_error?: string | null
          last_failed_at?: string | null
          last_success_at?: string | null
          name?: string
          priority?: number
          status?: string
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      paper_accounts: {
        Row: {
          cash: number
          created_at: string
          currency: string
          equity: number
          id: string
          user_id: string
        }
        Insert: {
          cash?: number
          created_at?: string
          currency?: string
          equity?: number
          id?: string
          user_id: string
        }
        Update: {
          cash?: number
          created_at?: string
          currency?: string
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
      serpapi_usage_logs: {
        Row: {
          created_at: string
          credits_used: number
          engine: string
          error_message: string | null
          id: string
          query: string | null
          response_time_ms: number | null
          status: string
          symbol: string | null
        }
        Insert: {
          created_at?: string
          credits_used?: number
          engine: string
          error_message?: string | null
          id?: string
          query?: string | null
          response_time_ms?: number | null
          status: string
          symbol?: string | null
        }
        Update: {
          created_at?: string
          credits_used?: number
          engine?: string
          error_message?: string | null
          id?: string
          query?: string | null
          response_time_ms?: number | null
          status?: string
          symbol?: string | null
        }
        Relationships: []
      }
      serpapi_usage_summary: {
        Row: {
          created_at: string
          date: string
          engine: string
          estimated_credits_used: number
          failed_requests: number
          id: string
          success_requests: number
          total_requests: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          engine: string
          estimated_credits_used?: number
          failed_requests?: number
          id?: string
          success_requests?: number
          total_requests?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          engine?: string
          estimated_credits_used?: number
          failed_requests?: number
          id?: string
          success_requests?: number
          total_requests?: number
          updated_at?: string
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
      ticker_sentiment_summary: {
        Row: {
          average_sentiment_score: number
          high_impact_news_count: number
          latest_news_at: string | null
          negative_count: number
          neutral_count: number
          positive_count: number
          summary: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          average_sentiment_score?: number
          high_impact_news_count?: number
          latest_news_at?: string | null
          negative_count?: number
          neutral_count?: number
          positive_count?: number
          summary?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          average_sentiment_score?: number
          high_impact_news_count?: number
          latest_news_at?: string | null
          negative_count?: number
          neutral_count?: number
          positive_count?: number
          summary?: string | null
          symbol?: string
          updated_at?: string
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
      [_ in never]: never
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

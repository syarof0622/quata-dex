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
      ai_agent_decisions: {
        Row: {
          action: string
          agent_id: string
          allocation_amount: number | null
          autonomous_rank: number | null
          autonomous_scan_id: string | null
          autonomous_score: number | null
          calibrated_confidence: number | null
          calibration_reason: string | null
          confidence: number | null
          confidence_adjustments: Json | null
          created_at: string
          data_freshness_seconds: number | null
          data_quality_snapshot: Json | null
          data_snapshot: Json | null
          data_source: string | null
          decision_status: string | null
          entry_price: number | null
          id: string
          idempotency_key: string | null
          paper_account_id: string
          portfolio_snapshot: Json | null
          raw_confidence: number | null
          reasoning: string | null
          risk_reward_ratio: number | null
          risk_snapshot: Json | null
          selection_mode: string
          selection_reason: string | null
          sentiment_snapshot: Json | null
          stop_loss: number | null
          strategy: string | null
          suggested_lot: number | null
          suggested_shares: number | null
          symbol: string
          take_profit: number | null
          technical_snapshot: Json | null
        }
        Insert: {
          action: string
          agent_id: string
          allocation_amount?: number | null
          autonomous_rank?: number | null
          autonomous_scan_id?: string | null
          autonomous_score?: number | null
          calibrated_confidence?: number | null
          calibration_reason?: string | null
          confidence?: number | null
          confidence_adjustments?: Json | null
          created_at?: string
          data_freshness_seconds?: number | null
          data_quality_snapshot?: Json | null
          data_snapshot?: Json | null
          data_source?: string | null
          decision_status?: string | null
          entry_price?: number | null
          id?: string
          idempotency_key?: string | null
          paper_account_id: string
          portfolio_snapshot?: Json | null
          raw_confidence?: number | null
          reasoning?: string | null
          risk_reward_ratio?: number | null
          risk_snapshot?: Json | null
          selection_mode?: string
          selection_reason?: string | null
          sentiment_snapshot?: Json | null
          stop_loss?: number | null
          strategy?: string | null
          suggested_lot?: number | null
          suggested_shares?: number | null
          symbol: string
          take_profit?: number | null
          technical_snapshot?: Json | null
        }
        Update: {
          action?: string
          agent_id?: string
          allocation_amount?: number | null
          autonomous_rank?: number | null
          autonomous_scan_id?: string | null
          autonomous_score?: number | null
          calibrated_confidence?: number | null
          calibration_reason?: string | null
          confidence?: number | null
          confidence_adjustments?: Json | null
          created_at?: string
          data_freshness_seconds?: number | null
          data_quality_snapshot?: Json | null
          data_snapshot?: Json | null
          data_source?: string | null
          decision_status?: string | null
          entry_price?: number | null
          id?: string
          idempotency_key?: string | null
          paper_account_id?: string
          portfolio_snapshot?: Json | null
          raw_confidence?: number | null
          reasoning?: string | null
          risk_reward_ratio?: number | null
          risk_snapshot?: Json | null
          selection_mode?: string
          selection_reason?: string | null
          sentiment_snapshot?: Json | null
          stop_loss?: number | null
          strategy?: string | null
          suggested_lot?: number | null
          suggested_shares?: number | null
          symbol?: string
          take_profit?: number | null
          technical_snapshot?: Json | null
        }
        Relationships: []
      }
      ai_agent_performance: {
        Row: {
          agent_id: string
          avg_holding_time: number | null
          avg_loss: number | null
          avg_win: number | null
          best_trade: number | null
          daily_return: number | null
          id: string
          loss_rate: number | null
          max_drawdown: number | null
          paper_account_id: string
          profit_factor: number | null
          total_return: number | null
          total_trades: number | null
          updated_at: string
          win_rate: number | null
          worst_trade: number | null
        }
        Insert: {
          agent_id: string
          avg_holding_time?: number | null
          avg_loss?: number | null
          avg_win?: number | null
          best_trade?: number | null
          daily_return?: number | null
          id?: string
          loss_rate?: number | null
          max_drawdown?: number | null
          paper_account_id: string
          profit_factor?: number | null
          total_return?: number | null
          total_trades?: number | null
          updated_at?: string
          win_rate?: number | null
          worst_trade?: number | null
        }
        Update: {
          agent_id?: string
          avg_holding_time?: number | null
          avg_loss?: number | null
          avg_win?: number | null
          best_trade?: number | null
          daily_return?: number | null
          id?: string
          loss_rate?: number | null
          max_drawdown?: number | null
          paper_account_id?: string
          profit_factor?: number | null
          total_return?: number | null
          total_trades?: number | null
          updated_at?: string
          win_rate?: number | null
          worst_trade?: number | null
        }
        Relationships: []
      }
      ai_agent_risk_logs: {
        Row: {
          action_taken: string | null
          agent_id: string
          created_at: string
          id: string
          message: string | null
          risk_level: string | null
          risk_type: string | null
          symbol: string | null
        }
        Insert: {
          action_taken?: string | null
          agent_id: string
          created_at?: string
          id?: string
          message?: string | null
          risk_level?: string | null
          risk_type?: string | null
          symbol?: string | null
        }
        Update: {
          action_taken?: string | null
          agent_id?: string
          created_at?: string
          id?: string
          message?: string | null
          risk_level?: string | null
          risk_type?: string | null
          symbol?: string | null
        }
        Relationships: []
      }
      ai_agent_scan_candidates: {
        Row: {
          agent_id: string
          autonomous_score: number
          created_at: string
          data_quality_score: number
          disclosure_score: number
          id: string
          liquidity_score: number
          market_context_score: number
          passed_filters: boolean
          rank: number | null
          reason: string | null
          recommendation: string | null
          rejection_reason: string | null
          risk_score: number
          scan_id: string
          sentiment_score: number
          symbol: string
          technical_score: number
          trade_setup_score: number
          warnings: Json
        }
        Insert: {
          agent_id: string
          autonomous_score?: number
          created_at?: string
          data_quality_score?: number
          disclosure_score?: number
          id?: string
          liquidity_score?: number
          market_context_score?: number
          passed_filters?: boolean
          rank?: number | null
          reason?: string | null
          recommendation?: string | null
          rejection_reason?: string | null
          risk_score?: number
          scan_id: string
          sentiment_score?: number
          symbol: string
          technical_score?: number
          trade_setup_score?: number
          warnings?: Json
        }
        Update: {
          agent_id?: string
          autonomous_score?: number
          created_at?: string
          data_quality_score?: number
          disclosure_score?: number
          id?: string
          liquidity_score?: number
          market_context_score?: number
          passed_filters?: boolean
          rank?: number | null
          reason?: string | null
          recommendation?: string | null
          rejection_reason?: string | null
          risk_score?: number
          scan_id?: string
          sentiment_score?: number
          symbol?: string
          technical_score?: number
          trade_setup_score?: number
          warnings?: Json
        }
        Relationships: []
      }
      ai_agent_scans: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          reasoning: string | null
          rejected_candidates: Json
          scan_status: string
          scan_time: string
          selected_symbols: Json
          selection_mode: string
          symbols_scanned_count: number
          top_candidates: Json
          universe: string
          valid_candidates_count: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          reasoning?: string | null
          rejected_candidates?: Json
          scan_status?: string
          scan_time?: string
          selected_symbols?: Json
          selection_mode?: string
          symbols_scanned_count?: number
          top_candidates?: Json
          universe: string
          valid_candidates_count?: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          reasoning?: string | null
          rejected_candidates?: Json
          scan_status?: string
          scan_time?: string
          selected_symbols?: Json
          selection_mode?: string
          symbols_scanned_count?: number
          top_candidates?: Json
          universe?: string
          valid_candidates_count?: number
        }
        Relationships: []
      }
      ai_agent_trade_memory: {
        Row: {
          agent_id: string
          best_strategy: string | null
          created_at: string
          id: string
          last_entry_reason: string | null
          last_trade_result: string | null
          recent_avg_return: number
          recent_mistake: string | null
          recent_win_rate: number
          sample_size: number
          sector_stats: Json
          strategy_stats: Json
          symbol: string
          ticker_stats: Json
          updated_at: string
          worst_strategy: string | null
        }
        Insert: {
          agent_id: string
          best_strategy?: string | null
          created_at?: string
          id?: string
          last_entry_reason?: string | null
          last_trade_result?: string | null
          recent_avg_return?: number
          recent_mistake?: string | null
          recent_win_rate?: number
          sample_size?: number
          sector_stats?: Json
          strategy_stats?: Json
          symbol: string
          ticker_stats?: Json
          updated_at?: string
          worst_strategy?: string | null
        }
        Update: {
          agent_id?: string
          best_strategy?: string | null
          created_at?: string
          id?: string
          last_entry_reason?: string | null
          last_trade_result?: string | null
          recent_avg_return?: number
          recent_mistake?: string | null
          recent_win_rate?: number
          sample_size?: number
          sector_stats?: Json
          strategy_stats?: Json
          symbol?: string
          ticker_stats?: Json
          updated_at?: string
          worst_strategy?: string | null
        }
        Relationships: []
      }
      ai_agent_training_events: {
        Row: {
          actual_outcome: Json | null
          agent_id: string
          ai_decision: Json | null
          autonomous_scan_snapshot: Json | null
          candidate_scores: Json | null
          confidence_calibration_snapshot: Json | null
          created_at: string
          data_quality_snapshot: Json | null
          decision_id: string | null
          decision_output: Json | null
          evaluated_at: string | null
          final_outcome: Json | null
          fundamental_snapshot: Json | null
          holding_period_minutes: number | null
          id: string
          input_features: Json | null
          lesson_label: string | null
          max_adverse_excursion: number | null
          max_favorable_excursion: number | null
          model_version: string | null
          order_id: string | null
          outcome_15m: Json | null
          outcome_1d: Json | null
          outcome_1h: Json | null
          outcome_1m: Json | null
          outcome_1w: Json | null
          outcome_eod: Json | null
          paper_execution: Json | null
          paper_pnl_percent: number | null
          paper_return: number | null
          pnl: number | null
          pnl_percent: number | null
          position_id: string | null
          real_disclosure_data: Json | null
          real_market_context: Json | null
          real_market_data: Json | null
          real_news_data: Json | null
          real_technical_data: Json | null
          sector_comparison_snapshot: Json | null
          selection_mode: string | null
          selection_outcome: Json | null
          strategy_version: string | null
          symbol: string
          undervalue_score_snapshot: Json | null
          updated_at: string
          valuation_classification: string | null
          value_trap_risk_score: number | null
          was_correct: boolean | null
        }
        Insert: {
          actual_outcome?: Json | null
          agent_id: string
          ai_decision?: Json | null
          autonomous_scan_snapshot?: Json | null
          candidate_scores?: Json | null
          confidence_calibration_snapshot?: Json | null
          created_at?: string
          data_quality_snapshot?: Json | null
          decision_id?: string | null
          decision_output?: Json | null
          evaluated_at?: string | null
          final_outcome?: Json | null
          fundamental_snapshot?: Json | null
          holding_period_minutes?: number | null
          id?: string
          input_features?: Json | null
          lesson_label?: string | null
          max_adverse_excursion?: number | null
          max_favorable_excursion?: number | null
          model_version?: string | null
          order_id?: string | null
          outcome_15m?: Json | null
          outcome_1d?: Json | null
          outcome_1h?: Json | null
          outcome_1m?: Json | null
          outcome_1w?: Json | null
          outcome_eod?: Json | null
          paper_execution?: Json | null
          paper_pnl_percent?: number | null
          paper_return?: number | null
          pnl?: number | null
          pnl_percent?: number | null
          position_id?: string | null
          real_disclosure_data?: Json | null
          real_market_context?: Json | null
          real_market_data?: Json | null
          real_news_data?: Json | null
          real_technical_data?: Json | null
          sector_comparison_snapshot?: Json | null
          selection_mode?: string | null
          selection_outcome?: Json | null
          strategy_version?: string | null
          symbol: string
          undervalue_score_snapshot?: Json | null
          updated_at?: string
          valuation_classification?: string | null
          value_trap_risk_score?: number | null
          was_correct?: boolean | null
        }
        Update: {
          actual_outcome?: Json | null
          agent_id?: string
          ai_decision?: Json | null
          autonomous_scan_snapshot?: Json | null
          candidate_scores?: Json | null
          confidence_calibration_snapshot?: Json | null
          created_at?: string
          data_quality_snapshot?: Json | null
          decision_id?: string | null
          decision_output?: Json | null
          evaluated_at?: string | null
          final_outcome?: Json | null
          fundamental_snapshot?: Json | null
          holding_period_minutes?: number | null
          id?: string
          input_features?: Json | null
          lesson_label?: string | null
          max_adverse_excursion?: number | null
          max_favorable_excursion?: number | null
          model_version?: string | null
          order_id?: string | null
          outcome_15m?: Json | null
          outcome_1d?: Json | null
          outcome_1h?: Json | null
          outcome_1m?: Json | null
          outcome_1w?: Json | null
          outcome_eod?: Json | null
          paper_execution?: Json | null
          paper_pnl_percent?: number | null
          paper_return?: number | null
          pnl?: number | null
          pnl_percent?: number | null
          position_id?: string | null
          real_disclosure_data?: Json | null
          real_market_context?: Json | null
          real_market_data?: Json | null
          real_news_data?: Json | null
          real_technical_data?: Json | null
          sector_comparison_snapshot?: Json | null
          selection_mode?: string | null
          selection_outcome?: Json | null
          strategy_version?: string | null
          symbol?: string
          undervalue_score_snapshot?: Json | null
          updated_at?: string
          valuation_classification?: string | null
          value_trap_risk_score?: number | null
          was_correct?: boolean | null
        }
        Relationships: []
      }
      ai_confidence_calibration_logs: {
        Row: {
          adjustments: Json
          agent_id: string
          calibrated_confidence: number
          calibration_reason: string | null
          created_at: string
          id: string
          raw_confidence: number
          sample_size: number
          strategy: string | null
          symbol: string
        }
        Insert: {
          adjustments?: Json
          agent_id: string
          calibrated_confidence?: number
          calibration_reason?: string | null
          created_at?: string
          id?: string
          raw_confidence?: number
          sample_size?: number
          strategy?: string | null
          symbol: string
        }
        Update: {
          adjustments?: Json
          agent_id?: string
          calibrated_confidence?: number
          calibration_reason?: string | null
          created_at?: string
          id?: string
          raw_confidence?: number
          sample_size?: number
          strategy?: string | null
          symbol?: string
        }
        Relationships: []
      }
      ai_trade_agents: {
        Row: {
          allocation_amount: number | null
          allocation_mode: string
          allocation_percent: number | null
          allow_autonomous_rotation: boolean
          allow_average_down: boolean | null
          allow_buy: boolean | null
          allow_pyramiding: boolean | null
          allow_sell: boolean | null
          allow_short_sell: boolean | null
          auto_stop_loss: boolean | null
          auto_take_profit: boolean | null
          autonomous_allocation_mode: string
          autonomous_mode_acknowledged: boolean
          autonomous_rescan_interval_minutes: number
          autonomous_universe: string
          created_at: string
          id: string
          last_autonomous_scan_at: string | null
          last_error: string | null
          last_run_at: string | null
          max_active_positions: number
          max_autonomous_symbols: number
          max_daily_loss: number | null
          max_daily_trades: number | null
          max_drawdown: number | null
          max_new_entries_per_day: number
          max_position_per_symbol: number | null
          max_value_trap_risk: number
          min_autonomous_score: number
          min_confidence_to_trade: number | null
          min_data_quality_score: number
          min_liquidity_score: number
          min_undervalue_score: number
          mode: string
          name: string
          paper_account_id: string
          paper_trading_only: boolean
          paused_at: string | null
          require_fresh_data: boolean | null
          require_fundamental_data: boolean
          risk_level: string
          selected_symbols: Json
          started_at: string | null
          status: string
          stopped_at: string | null
          strategy_mode: string
          symbol_selection_mode: string
          trading_enabled: boolean | null
          trading_hours_only: boolean | null
          trailing_stop: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allocation_amount?: number | null
          allocation_mode?: string
          allocation_percent?: number | null
          allow_autonomous_rotation?: boolean
          allow_average_down?: boolean | null
          allow_buy?: boolean | null
          allow_pyramiding?: boolean | null
          allow_sell?: boolean | null
          allow_short_sell?: boolean | null
          auto_stop_loss?: boolean | null
          auto_take_profit?: boolean | null
          autonomous_allocation_mode?: string
          autonomous_mode_acknowledged?: boolean
          autonomous_rescan_interval_minutes?: number
          autonomous_universe?: string
          created_at?: string
          id?: string
          last_autonomous_scan_at?: string | null
          last_error?: string | null
          last_run_at?: string | null
          max_active_positions?: number
          max_autonomous_symbols?: number
          max_daily_loss?: number | null
          max_daily_trades?: number | null
          max_drawdown?: number | null
          max_new_entries_per_day?: number
          max_position_per_symbol?: number | null
          max_value_trap_risk?: number
          min_autonomous_score?: number
          min_confidence_to_trade?: number | null
          min_data_quality_score?: number
          min_liquidity_score?: number
          min_undervalue_score?: number
          mode?: string
          name?: string
          paper_account_id: string
          paper_trading_only?: boolean
          paused_at?: string | null
          require_fresh_data?: boolean | null
          require_fundamental_data?: boolean
          risk_level?: string
          selected_symbols?: Json
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          strategy_mode?: string
          symbol_selection_mode?: string
          trading_enabled?: boolean | null
          trading_hours_only?: boolean | null
          trailing_stop?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allocation_amount?: number | null
          allocation_mode?: string
          allocation_percent?: number | null
          allow_autonomous_rotation?: boolean
          allow_average_down?: boolean | null
          allow_buy?: boolean | null
          allow_pyramiding?: boolean | null
          allow_sell?: boolean | null
          allow_short_sell?: boolean | null
          auto_stop_loss?: boolean | null
          auto_take_profit?: boolean | null
          autonomous_allocation_mode?: string
          autonomous_mode_acknowledged?: boolean
          autonomous_rescan_interval_minutes?: number
          autonomous_universe?: string
          created_at?: string
          id?: string
          last_autonomous_scan_at?: string | null
          last_error?: string | null
          last_run_at?: string | null
          max_active_positions?: number
          max_autonomous_symbols?: number
          max_daily_loss?: number | null
          max_daily_trades?: number | null
          max_drawdown?: number | null
          max_new_entries_per_day?: number
          max_position_per_symbol?: number | null
          max_value_trap_risk?: number
          min_autonomous_score?: number
          min_confidence_to_trade?: number | null
          min_data_quality_score?: number
          min_liquidity_score?: number
          min_undervalue_score?: number
          mode?: string
          name?: string
          paper_account_id?: string
          paper_trading_only?: boolean
          paused_at?: string | null
          require_fresh_data?: boolean | null
          require_fundamental_data?: boolean
          risk_level?: string
          selected_symbols?: Json
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          strategy_mode?: string
          symbol_selection_mode?: string
          trading_enabled?: boolean | null
          trading_hours_only?: boolean | null
          trailing_stop?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_undervalue_scores: {
        Row: {
          classification: string
          created_at: string
          data_coverage: number
          dividend_score: number
          final_undervalue_score: number
          financial_health_score: number
          growth_score: number
          id: string
          quality_score: number
          reasoning: string | null
          sector_relative_score: number
          symbol: string
          technical_timing_score: number
          updated_at: string
          valuation_score: number
          value_trap_risk_score: number
          warnings: Json
        }
        Insert: {
          classification?: string
          created_at?: string
          data_coverage?: number
          dividend_score?: number
          final_undervalue_score?: number
          financial_health_score?: number
          growth_score?: number
          id?: string
          quality_score?: number
          reasoning?: string | null
          sector_relative_score?: number
          symbol: string
          technical_timing_score?: number
          updated_at?: string
          valuation_score?: number
          value_trap_risk_score?: number
          warnings?: Json
        }
        Update: {
          classification?: string
          created_at?: string
          data_coverage?: number
          dividend_score?: number
          final_undervalue_score?: number
          financial_health_score?: number
          growth_score?: number
          id?: string
          quality_score?: number
          reasoning?: string | null
          sector_relative_score?: number
          symbol?: string
          technical_timing_score?: number
          updated_at?: string
          valuation_score?: number
          value_trap_risk_score?: number
          warnings?: Json
        }
        Relationships: []
      }
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
      data_quality_snapshots: {
        Row: {
          created_at: string
          decision_allowed: boolean
          disclosure_quality: string
          fundamental_quality: string
          id: string
          news_quality: string
          overall_data_quality_score: number
          price_quality: string
          raw_payload: Json | null
          sentiment_quality: string
          source_reliability_score: number
          symbol: string
          technical_quality: string
          warnings: Json
        }
        Insert: {
          created_at?: string
          decision_allowed?: boolean
          disclosure_quality?: string
          fundamental_quality?: string
          id?: string
          news_quality?: string
          overall_data_quality_score?: number
          price_quality?: string
          raw_payload?: Json | null
          sentiment_quality?: string
          source_reliability_score?: number
          symbol: string
          technical_quality?: string
          warnings?: Json
        }
        Update: {
          created_at?: string
          decision_allowed?: boolean
          disclosure_quality?: string
          fundamental_quality?: string
          id?: string
          news_quality?: string
          overall_data_quality_score?: number
          price_quality?: string
          raw_payload?: Json | null
          sentiment_quality?: string
          source_reliability_score?: number
          symbol?: string
          technical_quality?: string
          warnings?: Json
        }
        Relationships: []
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
          fee: number | null
          filled_at: string | null
          filled_price: number | null
          id: string
          limit_price: number | null
          price: number | null
          qty: number
          realized_pnl: number
          side: string
          slippage_pct: number | null
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
          fee?: number | null
          filled_at?: string | null
          filled_price?: number | null
          id?: string
          limit_price?: number | null
          price?: number | null
          qty: number
          realized_pnl?: number
          side: string
          slippage_pct?: number | null
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
          fee?: number | null
          filled_at?: string | null
          filled_price?: number | null
          id?: string
          limit_price?: number | null
          price?: number | null
          qty?: number
          realized_pnl?: number
          side?: string
          slippage_pct?: number | null
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
      stock_fundamentals: {
        Row: {
          book_value_per_share: number | null
          company_name: string | null
          created_at: string
          data_freshness: string
          data_source: string | null
          der: number | null
          dividend_payout_ratio: number | null
          dividend_yield: number | null
          eps: number | null
          financial_report_date: string | null
          free_cash_flow: number | null
          gross_margin: number | null
          historical_pbv_avg: number | null
          historical_per_avg: number | null
          id: string
          industry: string | null
          market_cap: number | null
          net_margin: number | null
          net_profit: number | null
          net_profit_growth_yoy: number | null
          operating_cash_flow: number | null
          pbv: number | null
          per: number | null
          raw_payload: Json | null
          revenue: number | null
          revenue_growth_yoy: number | null
          roa: number | null
          roe: number | null
          sector: string | null
          sector_pbv_avg: number | null
          sector_per_avg: number | null
          sector_roe_avg: number | null
          symbol: string
          updated_at: string
        }
        Insert: {
          book_value_per_share?: number | null
          company_name?: string | null
          created_at?: string
          data_freshness?: string
          data_source?: string | null
          der?: number | null
          dividend_payout_ratio?: number | null
          dividend_yield?: number | null
          eps?: number | null
          financial_report_date?: string | null
          free_cash_flow?: number | null
          gross_margin?: number | null
          historical_pbv_avg?: number | null
          historical_per_avg?: number | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          net_margin?: number | null
          net_profit?: number | null
          net_profit_growth_yoy?: number | null
          operating_cash_flow?: number | null
          pbv?: number | null
          per?: number | null
          raw_payload?: Json | null
          revenue?: number | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          sector?: string | null
          sector_pbv_avg?: number | null
          sector_per_avg?: number | null
          sector_roe_avg?: number | null
          symbol: string
          updated_at?: string
        }
        Update: {
          book_value_per_share?: number | null
          company_name?: string | null
          created_at?: string
          data_freshness?: string
          data_source?: string | null
          der?: number | null
          dividend_payout_ratio?: number | null
          dividend_yield?: number | null
          eps?: number | null
          financial_report_date?: string | null
          free_cash_flow?: number | null
          gross_margin?: number | null
          historical_pbv_avg?: number | null
          historical_per_avg?: number | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          net_margin?: number | null
          net_profit?: number | null
          net_profit_growth_yoy?: number | null
          operating_cash_flow?: number | null
          pbv?: number | null
          per?: number | null
          raw_payload?: Json | null
          revenue?: number | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          sector?: string | null
          sector_pbv_avg?: number | null
          sector_per_avg?: number | null
          sector_roe_avg?: number | null
          symbol?: string
          updated_at?: string
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

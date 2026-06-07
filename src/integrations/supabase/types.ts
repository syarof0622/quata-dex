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
          autonomous_risk_mode: string | null
          autonomous_scan_id: string | null
          autonomous_score: number | null
          calibrated_confidence: number | null
          calibration_reason: string | null
          candidate_classification: string | null
          confidence: number | null
          confidence_adjustments: Json | null
          created_at: string
          data_freshness_seconds: number | null
          data_quality_snapshot: Json | null
          data_snapshot: Json | null
          data_source: string | null
          decision_replay_snapshot: Json | null
          decision_status: string | null
          entry_price: number | null
          exploration_trade: boolean
          id: string
          idempotency_key: string | null
          market_regime: string | null
          paper_account_id: string
          paper_order_id: string | null
          portfolio_snapshot: Json | null
          raw_confidence: number | null
          reasoning: string | null
          research_trade: boolean
          risk_reward_ratio: number | null
          risk_snapshot: Json | null
          selection_mode: string
          selection_reason: string | null
          sentiment_snapshot: Json | null
          setup_type: string | null
          signal_source: string | null
          stop_loss: number | null
          strategy: string | null
          strategy_context: Json | null
          strategy_name: string | null
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
          autonomous_risk_mode?: string | null
          autonomous_scan_id?: string | null
          autonomous_score?: number | null
          calibrated_confidence?: number | null
          calibration_reason?: string | null
          candidate_classification?: string | null
          confidence?: number | null
          confidence_adjustments?: Json | null
          created_at?: string
          data_freshness_seconds?: number | null
          data_quality_snapshot?: Json | null
          data_snapshot?: Json | null
          data_source?: string | null
          decision_replay_snapshot?: Json | null
          decision_status?: string | null
          entry_price?: number | null
          exploration_trade?: boolean
          id?: string
          idempotency_key?: string | null
          market_regime?: string | null
          paper_account_id: string
          paper_order_id?: string | null
          portfolio_snapshot?: Json | null
          raw_confidence?: number | null
          reasoning?: string | null
          research_trade?: boolean
          risk_reward_ratio?: number | null
          risk_snapshot?: Json | null
          selection_mode?: string
          selection_reason?: string | null
          sentiment_snapshot?: Json | null
          setup_type?: string | null
          signal_source?: string | null
          stop_loss?: number | null
          strategy?: string | null
          strategy_context?: Json | null
          strategy_name?: string | null
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
          autonomous_risk_mode?: string | null
          autonomous_scan_id?: string | null
          autonomous_score?: number | null
          calibrated_confidence?: number | null
          calibration_reason?: string | null
          candidate_classification?: string | null
          confidence?: number | null
          confidence_adjustments?: Json | null
          created_at?: string
          data_freshness_seconds?: number | null
          data_quality_snapshot?: Json | null
          data_snapshot?: Json | null
          data_source?: string | null
          decision_replay_snapshot?: Json | null
          decision_status?: string | null
          entry_price?: number | null
          exploration_trade?: boolean
          id?: string
          idempotency_key?: string | null
          market_regime?: string | null
          paper_account_id?: string
          paper_order_id?: string | null
          portfolio_snapshot?: Json | null
          raw_confidence?: number | null
          reasoning?: string | null
          research_trade?: boolean
          risk_reward_ratio?: number | null
          risk_snapshot?: Json | null
          selection_mode?: string
          selection_reason?: string | null
          sentiment_snapshot?: Json | null
          setup_type?: string | null
          signal_source?: string | null
          stop_loss?: number | null
          strategy?: string | null
          strategy_context?: Json | null
          strategy_name?: string | null
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
          blocked_reason: string | null
          candidate_classification: string
          created_at: string
          data_quality_score: number
          disclosure_score: number
          execution_eligibility: string
          fundamental_score: number
          hypothetical_return_15m: number | null
          hypothetical_return_1h: number | null
          hypothetical_return_eod: number | null
          hypothetical_tracking_enabled: boolean
          id: string
          liquidity_score: number
          market_context_score: number
          outcome_15m: Json | null
          outcome_1h: Json | null
          outcome_eod: Json | null
          passed_filters: boolean
          rank: number | null
          reason: string | null
          recommendation: string | null
          regime_fit_score: number
          rejection_reason: string | null
          research_trade_allowed: boolean
          risk_mode: string | null
          risk_score: number
          scan_id: string
          scan_price: number | null
          sector_fit_score: number
          sentiment_score: number
          symbol: string
          technical_score: number
          trade_setup_score: number
          undervalue_score: number
          warnings: Json
        }
        Insert: {
          agent_id: string
          autonomous_score?: number
          blocked_reason?: string | null
          candidate_classification?: string
          created_at?: string
          data_quality_score?: number
          disclosure_score?: number
          execution_eligibility?: string
          fundamental_score?: number
          hypothetical_return_15m?: number | null
          hypothetical_return_1h?: number | null
          hypothetical_return_eod?: number | null
          hypothetical_tracking_enabled?: boolean
          id?: string
          liquidity_score?: number
          market_context_score?: number
          outcome_15m?: Json | null
          outcome_1h?: Json | null
          outcome_eod?: Json | null
          passed_filters?: boolean
          rank?: number | null
          reason?: string | null
          recommendation?: string | null
          regime_fit_score?: number
          rejection_reason?: string | null
          research_trade_allowed?: boolean
          risk_mode?: string | null
          risk_score?: number
          scan_id: string
          scan_price?: number | null
          sector_fit_score?: number
          sentiment_score?: number
          symbol: string
          technical_score?: number
          trade_setup_score?: number
          undervalue_score?: number
          warnings?: Json
        }
        Update: {
          agent_id?: string
          autonomous_score?: number
          blocked_reason?: string | null
          candidate_classification?: string
          created_at?: string
          data_quality_score?: number
          disclosure_score?: number
          execution_eligibility?: string
          fundamental_score?: number
          hypothetical_return_15m?: number | null
          hypothetical_return_1h?: number | null
          hypothetical_return_eod?: number | null
          hypothetical_tracking_enabled?: boolean
          id?: string
          liquidity_score?: number
          market_context_score?: number
          outcome_15m?: Json | null
          outcome_1h?: Json | null
          outcome_eod?: Json | null
          passed_filters?: boolean
          rank?: number | null
          reason?: string | null
          recommendation?: string | null
          regime_fit_score?: number
          rejection_reason?: string | null
          research_trade_allowed?: boolean
          risk_mode?: string | null
          risk_score?: number
          scan_id?: string
          scan_price?: number | null
          sector_fit_score?: number
          sentiment_score?: number
          symbol?: string
          technical_score?: number
          trade_setup_score?: number
          undervalue_score?: number
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
          candidate_classification: string | null
          candidate_scores: Json | null
          close_reason: string | null
          confidence_calibration_snapshot: Json | null
          created_at: string
          data_quality_snapshot: Json | null
          decision_id: string | null
          decision_output: Json | null
          evaluated_at: string | null
          event_type: string | null
          final_outcome: Json | null
          fundamental_snapshot: Json | null
          holding_period_minutes: number | null
          hypothetical_tracking: Json | null
          id: string
          input_features: Json | null
          lesson_label: string | null
          max_adverse_excursion: number | null
          max_favorable_excursion: number | null
          missed_opportunity_score: number | null
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
          candidate_classification?: string | null
          candidate_scores?: Json | null
          close_reason?: string | null
          confidence_calibration_snapshot?: Json | null
          created_at?: string
          data_quality_snapshot?: Json | null
          decision_id?: string | null
          decision_output?: Json | null
          evaluated_at?: string | null
          event_type?: string | null
          final_outcome?: Json | null
          fundamental_snapshot?: Json | null
          holding_period_minutes?: number | null
          hypothetical_tracking?: Json | null
          id?: string
          input_features?: Json | null
          lesson_label?: string | null
          max_adverse_excursion?: number | null
          max_favorable_excursion?: number | null
          missed_opportunity_score?: number | null
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
          candidate_classification?: string | null
          candidate_scores?: Json | null
          close_reason?: string | null
          confidence_calibration_snapshot?: Json | null
          created_at?: string
          data_quality_snapshot?: Json | null
          decision_id?: string | null
          decision_output?: Json | null
          evaluated_at?: string | null
          event_type?: string | null
          final_outcome?: Json | null
          fundamental_snapshot?: Json | null
          holding_period_minutes?: number | null
          hypothetical_tracking?: Json | null
          id?: string
          input_features?: Json | null
          lesson_label?: string | null
          max_adverse_excursion?: number | null
          max_favorable_excursion?: number | null
          missed_opportunity_score?: number | null
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
      ai_alerts_definitions: {
        Row: {
          alert_type: string
          category: string
          created_at: string
          default_rule: Json
          description: string | null
          enabled: boolean
          id: string
          name: string
          severity: string
        }
        Insert: {
          alert_type: string
          category?: string
          created_at?: string
          default_rule?: Json
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          severity?: string
        }
        Update: {
          alert_type?: string
          category?: string
          created_at?: string
          default_rule?: Json
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          severity?: string
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
          aggression_mode: string
          allocation_amount: number | null
          allocation_mode: string
          allocation_percent: number | null
          allow_autonomous_rotation: boolean
          allow_average_down: boolean | null
          allow_buy: boolean | null
          allow_outcome_tracking_without_trade: boolean
          allow_premarket_planning: boolean
          allow_pyramiding: boolean | null
          allow_research_candidates: boolean
          allow_sell: boolean | null
          allow_short_sell: boolean | null
          allow_small_lot_exploration: boolean
          allow_watch_candidates: boolean
          atr_stop_enabled: boolean
          atr_stop_multiplier: number
          auto_stop_loss: boolean | null
          auto_take_profit: boolean | null
          automation_enabled: boolean
          autonomous_allocation_mode: string
          autonomous_mode_acknowledged: boolean
          autonomous_rescan_interval_minutes: number
          autonomous_risk_mode: string
          autonomous_universe: string
          circuit_breaker_enabled: boolean
          consecutive_losses: number
          correlation_risk_enabled: boolean
          created_at: string
          diagnostic_status: string
          diagnostic_summary: Json | null
          diagnostic_updated_at: string | null
          expert_research_max_allocation_pct: number
          id: string
          last_auto_decision_at: string | null
          last_auto_execution_at: string | null
          last_autonomous_scan_at: string | null
          last_blocked_reason: string | null
          last_error: string | null
          last_market_session_state: string | null
          last_profit_diagnostic: Json | null
          last_risk_evaluation: Json | null
          last_run_at: string | null
          last_worker_message: string | null
          last_worker_run_at: string | null
          last_worker_status: string | null
          liquidity_risk_enabled: boolean
          market_break_dedup_at: string | null
          max_active_positions: number
          max_autonomous_symbols: number
          max_consecutive_losses: number
          max_correlated_sector_entries_per_day: number
          max_daily_loss: number | null
          max_daily_loss_pct: number
          max_daily_trades: number | null
          max_drawdown: number | null
          max_holding_days: number
          max_losses_per_day: number
          max_new_entries_per_day: number
          max_portfolio_drawdown_pct: number
          max_position_per_symbol: number | null
          max_position_weight_pct: number
          max_research_trades_per_day: number
          max_sector_exposure_pct: number
          max_trades_per_symbol_per_day: number
          max_trades_per_symbol_per_week: number
          max_value_trap_risk: number
          min_autonomous_score: number
          min_cash_buffer_pct: number
          min_confidence_to_trade: number | null
          min_data_quality_score: number
          min_hold_minutes: number
          min_liquidity_score: number
          min_position_weight_pct: number | null
          min_profit_factor_threshold: number
          min_research_candidate_score: number
          min_risk_reward: number
          min_trade_quality_score: number
          min_undervalue_score: number
          min_watch_candidate_score: number
          min_win_rate_threshold: number
          mode: string
          momentum_extended_allocation_pct: number
          momentum_hunter_enabled: boolean
          momentum_max_allocation_pct: number
          momentum_min_change_pct: number
          momentum_min_rvol: number
          momentum_min_score: number
          name: string
          news_shock_risk_enabled: boolean
          next_expected_worker_run_at: string | null
          overtrading_guard_enabled: boolean
          paper_account_id: string
          paper_trading_only: boolean
          paused_at: string | null
          progressive_max_allocation_pct: number
          protection_mode_active: boolean
          protection_mode_reason: string | null
          require_fresh_data: boolean | null
          require_fundamental_data: boolean
          risk_level: string
          risk_off_filter_enabled: boolean
          risk_pause_reason: string | null
          risk_paused_until: string | null
          risk_per_trade_pct: number
          selected_symbols: Json
          started_at: string | null
          status: string
          stopped_at: string | null
          strategy_kill_switch_enabled: boolean
          strategy_mode: string
          swing_min_hold_minutes: number
          swing_mode_active: boolean
          swing_protection_active: boolean
          swing_protection_reason: string | null
          swing_protection_until: string | null
          swing_quality_threshold: number
          symbol_cooldown_enabled: boolean
          symbol_selection_mode: string
          target_exposure_pct: number | null
          target_holding_days: number
          time_stop_warning_days: number
          trading_enabled: boolean | null
          trading_hours_only: boolean | null
          trailing_stop: boolean | null
          updated_at: string
          user_id: string
          volatility_sizing_enabled: boolean
          worker_error_count: number
        }
        Insert: {
          aggression_mode?: string
          allocation_amount?: number | null
          allocation_mode?: string
          allocation_percent?: number | null
          allow_autonomous_rotation?: boolean
          allow_average_down?: boolean | null
          allow_buy?: boolean | null
          allow_outcome_tracking_without_trade?: boolean
          allow_premarket_planning?: boolean
          allow_pyramiding?: boolean | null
          allow_research_candidates?: boolean
          allow_sell?: boolean | null
          allow_short_sell?: boolean | null
          allow_small_lot_exploration?: boolean
          allow_watch_candidates?: boolean
          atr_stop_enabled?: boolean
          atr_stop_multiplier?: number
          auto_stop_loss?: boolean | null
          auto_take_profit?: boolean | null
          automation_enabled?: boolean
          autonomous_allocation_mode?: string
          autonomous_mode_acknowledged?: boolean
          autonomous_rescan_interval_minutes?: number
          autonomous_risk_mode?: string
          autonomous_universe?: string
          circuit_breaker_enabled?: boolean
          consecutive_losses?: number
          correlation_risk_enabled?: boolean
          created_at?: string
          diagnostic_status?: string
          diagnostic_summary?: Json | null
          diagnostic_updated_at?: string | null
          expert_research_max_allocation_pct?: number
          id?: string
          last_auto_decision_at?: string | null
          last_auto_execution_at?: string | null
          last_autonomous_scan_at?: string | null
          last_blocked_reason?: string | null
          last_error?: string | null
          last_market_session_state?: string | null
          last_profit_diagnostic?: Json | null
          last_risk_evaluation?: Json | null
          last_run_at?: string | null
          last_worker_message?: string | null
          last_worker_run_at?: string | null
          last_worker_status?: string | null
          liquidity_risk_enabled?: boolean
          market_break_dedup_at?: string | null
          max_active_positions?: number
          max_autonomous_symbols?: number
          max_consecutive_losses?: number
          max_correlated_sector_entries_per_day?: number
          max_daily_loss?: number | null
          max_daily_loss_pct?: number
          max_daily_trades?: number | null
          max_drawdown?: number | null
          max_holding_days?: number
          max_losses_per_day?: number
          max_new_entries_per_day?: number
          max_portfolio_drawdown_pct?: number
          max_position_per_symbol?: number | null
          max_position_weight_pct?: number
          max_research_trades_per_day?: number
          max_sector_exposure_pct?: number
          max_trades_per_symbol_per_day?: number
          max_trades_per_symbol_per_week?: number
          max_value_trap_risk?: number
          min_autonomous_score?: number
          min_cash_buffer_pct?: number
          min_confidence_to_trade?: number | null
          min_data_quality_score?: number
          min_hold_minutes?: number
          min_liquidity_score?: number
          min_position_weight_pct?: number | null
          min_profit_factor_threshold?: number
          min_research_candidate_score?: number
          min_risk_reward?: number
          min_trade_quality_score?: number
          min_undervalue_score?: number
          min_watch_candidate_score?: number
          min_win_rate_threshold?: number
          mode?: string
          momentum_extended_allocation_pct?: number
          momentum_hunter_enabled?: boolean
          momentum_max_allocation_pct?: number
          momentum_min_change_pct?: number
          momentum_min_rvol?: number
          momentum_min_score?: number
          name?: string
          news_shock_risk_enabled?: boolean
          next_expected_worker_run_at?: string | null
          overtrading_guard_enabled?: boolean
          paper_account_id: string
          paper_trading_only?: boolean
          paused_at?: string | null
          progressive_max_allocation_pct?: number
          protection_mode_active?: boolean
          protection_mode_reason?: string | null
          require_fresh_data?: boolean | null
          require_fundamental_data?: boolean
          risk_level?: string
          risk_off_filter_enabled?: boolean
          risk_pause_reason?: string | null
          risk_paused_until?: string | null
          risk_per_trade_pct?: number
          selected_symbols?: Json
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          strategy_kill_switch_enabled?: boolean
          strategy_mode?: string
          swing_min_hold_minutes?: number
          swing_mode_active?: boolean
          swing_protection_active?: boolean
          swing_protection_reason?: string | null
          swing_protection_until?: string | null
          swing_quality_threshold?: number
          symbol_cooldown_enabled?: boolean
          symbol_selection_mode?: string
          target_exposure_pct?: number | null
          target_holding_days?: number
          time_stop_warning_days?: number
          trading_enabled?: boolean | null
          trading_hours_only?: boolean | null
          trailing_stop?: boolean | null
          updated_at?: string
          user_id: string
          volatility_sizing_enabled?: boolean
          worker_error_count?: number
        }
        Update: {
          aggression_mode?: string
          allocation_amount?: number | null
          allocation_mode?: string
          allocation_percent?: number | null
          allow_autonomous_rotation?: boolean
          allow_average_down?: boolean | null
          allow_buy?: boolean | null
          allow_outcome_tracking_without_trade?: boolean
          allow_premarket_planning?: boolean
          allow_pyramiding?: boolean | null
          allow_research_candidates?: boolean
          allow_sell?: boolean | null
          allow_short_sell?: boolean | null
          allow_small_lot_exploration?: boolean
          allow_watch_candidates?: boolean
          atr_stop_enabled?: boolean
          atr_stop_multiplier?: number
          auto_stop_loss?: boolean | null
          auto_take_profit?: boolean | null
          automation_enabled?: boolean
          autonomous_allocation_mode?: string
          autonomous_mode_acknowledged?: boolean
          autonomous_rescan_interval_minutes?: number
          autonomous_risk_mode?: string
          autonomous_universe?: string
          circuit_breaker_enabled?: boolean
          consecutive_losses?: number
          correlation_risk_enabled?: boolean
          created_at?: string
          diagnostic_status?: string
          diagnostic_summary?: Json | null
          diagnostic_updated_at?: string | null
          expert_research_max_allocation_pct?: number
          id?: string
          last_auto_decision_at?: string | null
          last_auto_execution_at?: string | null
          last_autonomous_scan_at?: string | null
          last_blocked_reason?: string | null
          last_error?: string | null
          last_market_session_state?: string | null
          last_profit_diagnostic?: Json | null
          last_risk_evaluation?: Json | null
          last_run_at?: string | null
          last_worker_message?: string | null
          last_worker_run_at?: string | null
          last_worker_status?: string | null
          liquidity_risk_enabled?: boolean
          market_break_dedup_at?: string | null
          max_active_positions?: number
          max_autonomous_symbols?: number
          max_consecutive_losses?: number
          max_correlated_sector_entries_per_day?: number
          max_daily_loss?: number | null
          max_daily_loss_pct?: number
          max_daily_trades?: number | null
          max_drawdown?: number | null
          max_holding_days?: number
          max_losses_per_day?: number
          max_new_entries_per_day?: number
          max_portfolio_drawdown_pct?: number
          max_position_per_symbol?: number | null
          max_position_weight_pct?: number
          max_research_trades_per_day?: number
          max_sector_exposure_pct?: number
          max_trades_per_symbol_per_day?: number
          max_trades_per_symbol_per_week?: number
          max_value_trap_risk?: number
          min_autonomous_score?: number
          min_cash_buffer_pct?: number
          min_confidence_to_trade?: number | null
          min_data_quality_score?: number
          min_hold_minutes?: number
          min_liquidity_score?: number
          min_position_weight_pct?: number | null
          min_profit_factor_threshold?: number
          min_research_candidate_score?: number
          min_risk_reward?: number
          min_trade_quality_score?: number
          min_undervalue_score?: number
          min_watch_candidate_score?: number
          min_win_rate_threshold?: number
          mode?: string
          momentum_extended_allocation_pct?: number
          momentum_hunter_enabled?: boolean
          momentum_max_allocation_pct?: number
          momentum_min_change_pct?: number
          momentum_min_rvol?: number
          momentum_min_score?: number
          name?: string
          news_shock_risk_enabled?: boolean
          next_expected_worker_run_at?: string | null
          overtrading_guard_enabled?: boolean
          paper_account_id?: string
          paper_trading_only?: boolean
          paused_at?: string | null
          progressive_max_allocation_pct?: number
          protection_mode_active?: boolean
          protection_mode_reason?: string | null
          require_fresh_data?: boolean | null
          require_fundamental_data?: boolean
          risk_level?: string
          risk_off_filter_enabled?: boolean
          risk_pause_reason?: string | null
          risk_paused_until?: string | null
          risk_per_trade_pct?: number
          selected_symbols?: Json
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          strategy_kill_switch_enabled?: boolean
          strategy_mode?: string
          swing_min_hold_minutes?: number
          swing_mode_active?: boolean
          swing_protection_active?: boolean
          swing_protection_reason?: string | null
          swing_protection_until?: string | null
          swing_quality_threshold?: number
          symbol_cooldown_enabled?: boolean
          symbol_selection_mode?: string
          target_exposure_pct?: number | null
          target_holding_days?: number
          time_stop_warning_days?: number
          trading_enabled?: boolean | null
          trading_hours_only?: boolean | null
          trailing_stop?: boolean | null
          updated_at?: string
          user_id?: string
          volatility_sizing_enabled?: boolean
          worker_error_count?: number
        }
        Relationships: []
      }
      ai_trade_reviews: {
        Row: {
          agent_id: string
          ai_review: string | null
          created_at: string
          decision_id: string | null
          entry_context: Json | null
          entry_price: number | null
          entry_reason: string | null
          exit_context: Json | null
          exit_price: number | null
          exit_reason: string | null
          holding_minutes: number | null
          id: string
          lesson_label: string | null
          market_regime: string | null
          mistake_category: string | null
          outcome: string
          paper_account_id: string
          pnl: number | null
          pnl_pct: number | null
          qty: number | null
          recommended_adjustment: string | null
          strategy: string | null
          symbol: string
          trade_quality_score: number | null
          training_event_id: string | null
          what_went_right: string | null
          what_went_wrong: string | null
        }
        Insert: {
          agent_id: string
          ai_review?: string | null
          created_at?: string
          decision_id?: string | null
          entry_context?: Json | null
          entry_price?: number | null
          entry_reason?: string | null
          exit_context?: Json | null
          exit_price?: number | null
          exit_reason?: string | null
          holding_minutes?: number | null
          id?: string
          lesson_label?: string | null
          market_regime?: string | null
          mistake_category?: string | null
          outcome?: string
          paper_account_id: string
          pnl?: number | null
          pnl_pct?: number | null
          qty?: number | null
          recommended_adjustment?: string | null
          strategy?: string | null
          symbol: string
          trade_quality_score?: number | null
          training_event_id?: string | null
          what_went_right?: string | null
          what_went_wrong?: string | null
        }
        Update: {
          agent_id?: string
          ai_review?: string | null
          created_at?: string
          decision_id?: string | null
          entry_context?: Json | null
          entry_price?: number | null
          entry_reason?: string | null
          exit_context?: Json | null
          exit_price?: number | null
          exit_reason?: string | null
          holding_minutes?: number | null
          id?: string
          lesson_label?: string | null
          market_regime?: string | null
          mistake_category?: string | null
          outcome?: string
          paper_account_id?: string
          pnl?: number | null
          pnl_pct?: number | null
          qty?: number | null
          recommended_adjustment?: string | null
          strategy?: string | null
          symbol?: string
          trade_quality_score?: number | null
          training_event_id?: string | null
          what_went_right?: string | null
          what_went_wrong?: string | null
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
      app_settings: {
        Row: {
          default_ai_agent_mode: string
          default_currency: string
          default_language: string
          default_starting_balance: number
          id: boolean
          registration_enabled: boolean
          updated_at: string
        }
        Insert: {
          default_ai_agent_mode?: string
          default_currency?: string
          default_language?: string
          default_starting_balance?: number
          id?: boolean
          registration_enabled?: boolean
          updated_at?: string
        }
        Update: {
          default_ai_agent_mode?: string
          default_currency?: string
          default_language?: string
          default_starting_balance?: number
          id?: boolean
          registration_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      backtests: {
        Row: {
          drift_score: number | null
          equity_curve_json: Json
          id: string
          metrics_json: Json
          ran_at: string
          regime: string | null
          sector: string | null
          strategy_id: string | null
          strategy_version: string | null
          symbol: string
          timeframe: string
          user_id: string
        }
        Insert: {
          drift_score?: number | null
          equity_curve_json?: Json
          id?: string
          metrics_json?: Json
          ran_at?: string
          regime?: string | null
          sector?: string | null
          strategy_id?: string | null
          strategy_version?: string | null
          symbol: string
          timeframe: string
          user_id: string
        }
        Update: {
          drift_score?: number | null
          equity_curve_json?: Json
          id?: string
          metrics_json?: Json
          ran_at?: string
          regime?: string | null
          sector?: string | null
          strategy_id?: string | null
          strategy_version?: string | null
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
      corporate_actions: {
        Row: {
          action_type: string
          amount: number | null
          announcement_date: string | null
          company_name: string | null
          created_at: string
          cum_date: string | null
          currency: string | null
          description: string | null
          ex_date: string | null
          id: string
          impact_score: number
          payment_date: string | null
          ratio: string | null
          raw_payload: Json | null
          recording_date: string | null
          risk_flags: string[]
          sentiment: string
          source: string
          source_url: string | null
          status: string
          symbol: string
          title: string
          updated_at: string
        }
        Insert: {
          action_type: string
          amount?: number | null
          announcement_date?: string | null
          company_name?: string | null
          created_at?: string
          cum_date?: string | null
          currency?: string | null
          description?: string | null
          ex_date?: string | null
          id?: string
          impact_score?: number
          payment_date?: string | null
          ratio?: string | null
          raw_payload?: Json | null
          recording_date?: string | null
          risk_flags?: string[]
          sentiment?: string
          source: string
          source_url?: string | null
          status?: string
          symbol: string
          title: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          amount?: number | null
          announcement_date?: string | null
          company_name?: string | null
          created_at?: string
          cum_date?: string | null
          currency?: string | null
          description?: string | null
          ex_date?: string | null
          id?: string
          impact_score?: number
          payment_date?: string | null
          ratio?: string | null
          raw_payload?: Json | null
          recording_date?: string | null
          risk_flags?: string[]
          sentiment?: string
          source?: string
          source_url?: string | null
          status?: string
          symbol?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      disclosure_pipeline_runs: {
        Row: {
          corporate_action_count: number
          created_at: string
          duplicate_count: number
          duration_ms: number | null
          error_message: string | null
          fetched_count: number
          finished_at: string | null
          high_impact_count: number
          id: string
          inserted_count: number
          official_count: number
          regulatory_event_count: number
          source_results: Json
          started_at: string
          status: string
          trigger_source: string | null
        }
        Insert: {
          corporate_action_count?: number
          created_at?: string
          duplicate_count?: number
          duration_ms?: number | null
          error_message?: string | null
          fetched_count?: number
          finished_at?: string | null
          high_impact_count?: number
          id?: string
          inserted_count?: number
          official_count?: number
          regulatory_event_count?: number
          source_results?: Json
          started_at?: string
          status?: string
          trigger_source?: string | null
        }
        Update: {
          corporate_action_count?: number
          created_at?: string
          duplicate_count?: number
          duration_ms?: number | null
          error_message?: string | null
          fetched_count?: number
          finished_at?: string | null
          high_impact_count?: number
          id?: string
          inserted_count?: number
          official_count?: number
          regulatory_event_count?: number
          source_results?: Json
          started_at?: string
          status?: string
          trigger_source?: string | null
        }
        Relationships: []
      }
      fundamental_news_links: {
        Row: {
          created_at: string
          disclosure_id: string | null
          id: string
          link_type: string
          news_article_id: string | null
          note: string | null
          relevance_score: number
          symbol: string
          validation_effect: string
        }
        Insert: {
          created_at?: string
          disclosure_id?: string | null
          id?: string
          link_type: string
          news_article_id?: string | null
          note?: string | null
          relevance_score?: number
          symbol: string
          validation_effect?: string
        }
        Update: {
          created_at?: string
          disclosure_id?: string | null
          id?: string
          link_type?: string
          news_article_id?: string | null
          note?: string | null
          relevance_score?: number
          symbol?: string
          validation_effect?: string
        }
        Relationships: []
      }
      fundamental_quality_scores: {
        Row: {
          as_of: string
          blocking_reasons: Json
          completeness_score: number
          confidence_score: number
          consistency_score: number
          created_at: string
          days_since_report: number | null
          freshness_score: number
          fundamental_freshness: string
          id: string
          latest_report_date: string | null
          latest_report_period: string | null
          missing_fields: Json
          source_score: number
          stale_fields: Json
          status: string
          symbol: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          as_of?: string
          blocking_reasons?: Json
          completeness_score?: number
          confidence_score?: number
          consistency_score?: number
          created_at?: string
          days_since_report?: number | null
          freshness_score?: number
          fundamental_freshness?: string
          id?: string
          latest_report_date?: string | null
          latest_report_period?: string | null
          missing_fields?: Json
          source_score?: number
          stale_fields?: Json
          status?: string
          symbol: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          as_of?: string
          blocking_reasons?: Json
          completeness_score?: number
          confidence_score?: number
          consistency_score?: number
          created_at?: string
          days_since_report?: number | null
          freshness_score?: number
          fundamental_freshness?: string
          id?: string
          latest_report_date?: string | null
          latest_report_period?: string | null
          missing_fields?: Json
          source_score?: number
          stale_fields?: Json
          status?: string
          symbol?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: []
      }
      fundamental_signal_snapshots: {
        Row: {
          as_of: string
          confidence: number
          created_at: string
          der: number | null
          dividend_score: number
          dividend_yield: number | null
          explanation: string | null
          final_fundamental_label: string
          growth_score: number
          id: string
          key_metrics: Json
          missing_data_reasons: Json
          negative_reasons: Json
          pbv: number | null
          per: number | null
          positive_reasons: Json
          profitability_score: number
          quality_score: number
          reasons: Json
          roe: number | null
          sector: string | null
          sector_median_der: number | null
          sector_median_pbv: number | null
          sector_median_per: number | null
          sector_median_roe: number | null
          solvency_score: number
          source: string | null
          source_url: string | null
          symbol: string
          undervalue_score: number
          updated_at: string
          valuation_score: number
          valuation_status: string
          value_trap_level: string
          value_trap_reasons: Json
          value_trap_risk: number
          warnings: Json
        }
        Insert: {
          as_of?: string
          confidence?: number
          created_at?: string
          der?: number | null
          dividend_score?: number
          dividend_yield?: number | null
          explanation?: string | null
          final_fundamental_label?: string
          growth_score?: number
          id?: string
          key_metrics?: Json
          missing_data_reasons?: Json
          negative_reasons?: Json
          pbv?: number | null
          per?: number | null
          positive_reasons?: Json
          profitability_score?: number
          quality_score?: number
          reasons?: Json
          roe?: number | null
          sector?: string | null
          sector_median_der?: number | null
          sector_median_pbv?: number | null
          sector_median_per?: number | null
          sector_median_roe?: number | null
          solvency_score?: number
          source?: string | null
          source_url?: string | null
          symbol: string
          undervalue_score?: number
          updated_at?: string
          valuation_score?: number
          valuation_status?: string
          value_trap_level?: string
          value_trap_reasons?: Json
          value_trap_risk?: number
          warnings?: Json
        }
        Update: {
          as_of?: string
          confidence?: number
          created_at?: string
          der?: number | null
          dividend_score?: number
          dividend_yield?: number | null
          explanation?: string | null
          final_fundamental_label?: string
          growth_score?: number
          id?: string
          key_metrics?: Json
          missing_data_reasons?: Json
          negative_reasons?: Json
          pbv?: number | null
          per?: number | null
          positive_reasons?: Json
          profitability_score?: number
          quality_score?: number
          reasons?: Json
          roe?: number | null
          sector?: string | null
          sector_median_der?: number | null
          sector_median_pbv?: number | null
          sector_median_per?: number | null
          sector_median_roe?: number | null
          solvency_score?: number
          source?: string | null
          source_url?: string | null
          symbol?: string
          undervalue_score?: number
          updated_at?: string
          valuation_score?: number
          valuation_status?: string
          value_trap_level?: string
          value_trap_reasons?: Json
          value_trap_risk?: number
          warnings?: Json
        }
        Relationships: []
      }
      fundamental_snapshots: {
        Row: {
          book_value_per_share: number | null
          capex: number | null
          cash: number | null
          company_name: string | null
          created_at: string
          currency: string
          data_quality: string | null
          eps: number | null
          financing_cashflow: number | null
          fiscal_quarter: number | null
          fiscal_year: number
          free_cashflow: number | null
          gross_profit: number | null
          id: string
          investing_cashflow: number | null
          net_income: number | null
          operating_cashflow: number | null
          operating_profit: number | null
          period: string
          raw_payload: Json | null
          report_date: string | null
          revenue: number | null
          sector: string | null
          shares_outstanding: number | null
          source: string
          source_url: string | null
          symbol: string
          total_assets: number | null
          total_debt: number | null
          total_equity: number | null
          total_liabilities: number | null
          updated_at: string
        }
        Insert: {
          book_value_per_share?: number | null
          capex?: number | null
          cash?: number | null
          company_name?: string | null
          created_at?: string
          currency?: string
          data_quality?: string | null
          eps?: number | null
          financing_cashflow?: number | null
          fiscal_quarter?: number | null
          fiscal_year: number
          free_cashflow?: number | null
          gross_profit?: number | null
          id?: string
          investing_cashflow?: number | null
          net_income?: number | null
          operating_cashflow?: number | null
          operating_profit?: number | null
          period: string
          raw_payload?: Json | null
          report_date?: string | null
          revenue?: number | null
          sector?: string | null
          shares_outstanding?: number | null
          source: string
          source_url?: string | null
          symbol: string
          total_assets?: number | null
          total_debt?: number | null
          total_equity?: number | null
          total_liabilities?: number | null
          updated_at?: string
        }
        Update: {
          book_value_per_share?: number | null
          capex?: number | null
          cash?: number | null
          company_name?: string | null
          created_at?: string
          currency?: string
          data_quality?: string | null
          eps?: number | null
          financing_cashflow?: number | null
          fiscal_quarter?: number | null
          fiscal_year?: number
          free_cashflow?: number | null
          gross_profit?: number | null
          id?: string
          investing_cashflow?: number | null
          net_income?: number | null
          operating_cashflow?: number | null
          operating_profit?: number | null
          period?: string
          raw_payload?: Json | null
          report_date?: string | null
          revenue?: number | null
          sector?: string | null
          shares_outstanding?: number | null
          source?: string
          source_url?: string | null
          symbol?: string
          total_assets?: number | null
          total_debt?: number | null
          total_equity?: number | null
          total_liabilities?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fundamental_source_logs: {
        Row: {
          attempt_time: string
          available_fields: string[]
          created_at: string
          error_code: string | null
          error_message: string | null
          fetch_status: string | null
          freshness_detected: string | null
          http_status: number | null
          id: string
          missing_fields: string[]
          missing_reason: Json
          payload_hash: string | null
          raw_payload: Json | null
          source: string
          source_type: string | null
          status: string
          symbol: string
        }
        Insert: {
          attempt_time?: string
          available_fields?: string[]
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          fetch_status?: string | null
          freshness_detected?: string | null
          http_status?: number | null
          id?: string
          missing_fields?: string[]
          missing_reason?: Json
          payload_hash?: string | null
          raw_payload?: Json | null
          source: string
          source_type?: string | null
          status: string
          symbol: string
        }
        Update: {
          attempt_time?: string
          available_fields?: string[]
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          fetch_status?: string | null
          freshness_detected?: string | null
          http_status?: number | null
          id?: string
          missing_fields?: string[]
          missing_reason?: Json
          payload_hash?: string | null
          raw_payload?: Json | null
          source?: string
          source_type?: string | null
          status?: string
          symbol?: string
        }
        Relationships: []
      }
      market_data_quality_snapshots: {
        Row: {
          created_at: string
          data_quality_score: number
          errors: string[]
          fresh_symbols: number
          id: string
          ihsg_updated_at: string | null
          ihsg_value: number | null
          latest_price_at: string | null
          market_session: string | null
          source_summary: Json
          stale_symbols: number
          status: string
          symbols_checked: number
          symbols_missing_price: number
          symbols_with_price: number
          warnings: string[]
        }
        Insert: {
          created_at?: string
          data_quality_score?: number
          errors?: string[]
          fresh_symbols?: number
          id?: string
          ihsg_updated_at?: string | null
          ihsg_value?: number | null
          latest_price_at?: string | null
          market_session?: string | null
          source_summary?: Json
          stale_symbols?: number
          status?: string
          symbols_checked?: number
          symbols_missing_price?: number
          symbols_with_price?: number
          warnings?: string[]
        }
        Update: {
          created_at?: string
          data_quality_score?: number
          errors?: string[]
          fresh_symbols?: number
          id?: string
          ihsg_updated_at?: string | null
          ihsg_value?: number | null
          latest_price_at?: string | null
          market_session?: string | null
          source_summary?: Json
          stale_symbols?: number
          status?: string
          symbols_checked?: number
          symbols_missing_price?: number
          symbols_with_price?: number
          warnings?: string[]
        }
        Relationships: []
      }
      market_regime_snapshots: {
        Row: {
          advancers: number | null
          breadth_pct: number | null
          created_at: string
          decliners: number | null
          id: string
          idx_change_pct: number | null
          idx_level: number | null
          raw_payload: Json | null
          reasoning: string | null
          regime_breadth: string
          regime_classification: string
          regime_trend: string
          regime_volatility: string
        }
        Insert: {
          advancers?: number | null
          breadth_pct?: number | null
          created_at?: string
          decliners?: number | null
          id?: string
          idx_change_pct?: number | null
          idx_level?: number | null
          raw_payload?: Json | null
          reasoning?: string | null
          regime_breadth?: string
          regime_classification?: string
          regime_trend?: string
          regime_volatility?: string
        }
        Update: {
          advancers?: number | null
          breadth_pct?: number | null
          created_at?: string
          decliners?: number | null
          id?: string
          idx_change_pct?: number | null
          idx_level?: number | null
          raw_payload?: Json | null
          reasoning?: string | null
          regime_breadth?: string
          regime_classification?: string
          regime_trend?: string
          regime_volatility?: string
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          canonical_article_id: string | null
          canonical_url: string | null
          category: string | null
          confidence: number
          created_at: string
          duplicate_group_id: string | null
          duplicate_of: string | null
          duplicate_sources: string[] | null
          event_cluster_id: string | null
          fetched_at: string
          id: string
          image_url: string | null
          impact_category: string
          impact_level: string
          impact_score: number
          is_duplicate: boolean
          is_noise: boolean
          keywords: string[] | null
          primary_ticker: string | null
          published_at: string
          raw_payload: Json | null
          related_symbols: string[] | null
          relevance_class: string
          sectors: string[] | null
          sentiment: string
          sentiment_score: number
          source: string
          source_id: string
          source_reliability_weight: number
          summary: string | null
          ticker_relevance_score: number
          tickers: string[] | null
          title: string
          title_hash: string | null
          updated_at: string
          url: string
        }
        Insert: {
          canonical_article_id?: string | null
          canonical_url?: string | null
          category?: string | null
          confidence?: number
          created_at?: string
          duplicate_group_id?: string | null
          duplicate_of?: string | null
          duplicate_sources?: string[] | null
          event_cluster_id?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          impact_category?: string
          impact_level?: string
          impact_score?: number
          is_duplicate?: boolean
          is_noise?: boolean
          keywords?: string[] | null
          primary_ticker?: string | null
          published_at?: string
          raw_payload?: Json | null
          related_symbols?: string[] | null
          relevance_class?: string
          sectors?: string[] | null
          sentiment?: string
          sentiment_score?: number
          source: string
          source_id: string
          source_reliability_weight?: number
          summary?: string | null
          ticker_relevance_score?: number
          tickers?: string[] | null
          title: string
          title_hash?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          canonical_article_id?: string | null
          canonical_url?: string | null
          category?: string | null
          confidence?: number
          created_at?: string
          duplicate_group_id?: string | null
          duplicate_of?: string | null
          duplicate_sources?: string[] | null
          event_cluster_id?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          impact_category?: string
          impact_level?: string
          impact_score?: number
          is_duplicate?: boolean
          is_noise?: boolean
          keywords?: string[] | null
          primary_ticker?: string | null
          published_at?: string
          raw_payload?: Json | null
          related_symbols?: string[] | null
          relevance_class?: string
          sectors?: string[] | null
          sentiment?: string
          sentiment_score?: number
          source?: string
          source_id?: string
          source_reliability_weight?: number
          summary?: string | null
          ticker_relevance_score?: number
          tickers?: string[] | null
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
      news_pipeline_runs: {
        Row: {
          created_at: string
          duplicate_count: number
          duration_ms: number | null
          error_message: string | null
          failed_count: number
          failed_sources: number
          fallback_sources: number
          fetched_count: number
          finished_at: string | null
          id: string
          inserted_count: number
          quota_protected_sources: number
          run_type: string
          skipped_count: number
          source_results: Json
          started_at: string
          status: string
          successful_sources: number
          total_sources: number
          trigger_source: string | null
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          failed_sources?: number
          fallback_sources?: number
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          quota_protected_sources?: number
          run_type?: string
          skipped_count?: number
          source_results?: Json
          started_at?: string
          status: string
          successful_sources?: number
          total_sources?: number
          trigger_source?: string | null
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          failed_sources?: number
          fallback_sources?: number
          fetched_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          quota_protected_sources?: number
          run_type?: string
          skipped_count?: number
          source_results?: Json
          started_at?: string
          status?: string
          successful_sources?: number
          total_sources?: number
          trigger_source?: string | null
        }
        Relationships: []
      }
      news_price_alignment: {
        Row: {
          alignment: string
          classification: string | null
          computed_at: string
          confidence: number
          event_cluster_id: string | null
          id: string
          impact_category: string | null
          news_article_id: string | null
          news_sentiment: string
          price_after_15m: number | null
          price_after_1h: number | null
          price_at_eod: number | null
          price_at_publish: number | null
          price_direction: string
          price_next_day: number | null
          reasoning: string | null
          return_15m: number | null
          return_1h: number | null
          return_eod: number | null
          return_next_day: number | null
          symbol: string
          volume_reaction: number | null
        }
        Insert: {
          alignment: string
          classification?: string | null
          computed_at?: string
          confidence?: number
          event_cluster_id?: string | null
          id?: string
          impact_category?: string | null
          news_article_id?: string | null
          news_sentiment: string
          price_after_15m?: number | null
          price_after_1h?: number | null
          price_at_eod?: number | null
          price_at_publish?: number | null
          price_direction: string
          price_next_day?: number | null
          reasoning?: string | null
          return_15m?: number | null
          return_1h?: number | null
          return_eod?: number | null
          return_next_day?: number | null
          symbol: string
          volume_reaction?: number | null
        }
        Update: {
          alignment?: string
          classification?: string | null
          computed_at?: string
          confidence?: number
          event_cluster_id?: string | null
          id?: string
          impact_category?: string | null
          news_article_id?: string | null
          news_sentiment?: string
          price_after_15m?: number | null
          price_after_1h?: number | null
          price_at_eod?: number | null
          price_at_publish?: number | null
          price_direction?: string
          price_next_day?: number | null
          reasoning?: string | null
          return_15m?: number | null
          return_1h?: number | null
          return_eod?: number | null
          return_next_day?: number | null
          symbol?: string
          volume_reaction?: number | null
        }
        Relationships: []
      }
      news_sentiment_snapshots: {
        Row: {
          article_count: number
          created_at: string
          freshness: string
          high_impact_count: number
          id: string
          negative_count: number
          neutral_count: number
          positive_count: number
          sentiment_score: number
          source_breakdown: Json
          top_bearish: Json
          top_bullish: Json
          window_key: string
        }
        Insert: {
          article_count?: number
          created_at?: string
          freshness?: string
          high_impact_count?: number
          id?: string
          negative_count?: number
          neutral_count?: number
          positive_count?: number
          sentiment_score?: number
          source_breakdown?: Json
          top_bearish?: Json
          top_bullish?: Json
          window_key: string
        }
        Update: {
          article_count?: number
          created_at?: string
          freshness?: string
          high_impact_count?: number
          id?: string
          negative_count?: number
          neutral_count?: number
          positive_count?: number
          sentiment_score?: number
          source_breakdown?: Json
          top_bearish?: Json
          top_bullish?: Json
          window_key?: string
        }
        Relationships: []
      }
      news_source_health: {
        Row: {
          consecutive_failures: number
          disabled: boolean
          fallback_active: boolean
          fetched_count_24h: number
          http_status: number | null
          id: string
          inserted_count_24h: number
          last_attempt_at: string | null
          last_error: string | null
          last_failed_at: string | null
          last_message: string | null
          last_success_at: string | null
          quota_protected: boolean
          source_key: string
          source_name: string
          source_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          disabled?: boolean
          fallback_active?: boolean
          fetched_count_24h?: number
          http_status?: number | null
          id?: string
          inserted_count_24h?: number
          last_attempt_at?: string | null
          last_error?: string | null
          last_failed_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          quota_protected?: boolean
          source_key: string
          source_name: string
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          disabled?: boolean
          fallback_active?: boolean
          fetched_count_24h?: number
          http_status?: number | null
          id?: string
          inserted_count_24h?: number
          last_attempt_at?: string | null
          last_error?: string | null
          last_failed_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          quota_protected?: boolean
          source_key?: string
          source_name?: string
          source_type?: string | null
          status?: string
          updated_at?: string
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
      news_worker_state: {
        Row: {
          id: string
          last_news_worker_message: string | null
          last_news_worker_run_at: string | null
          last_successful_news_run_at: string | null
          news_worker_error_count: number
          news_worker_status: string | null
          next_expected_news_worker_run_at: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          last_news_worker_message?: string | null
          last_news_worker_run_at?: string | null
          last_successful_news_run_at?: string | null
          news_worker_error_count?: number
          news_worker_status?: string | null
          next_expected_news_worker_run_at?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          last_news_worker_message?: string | null
          last_news_worker_run_at?: string | null
          last_successful_news_run_at?: string | null
          news_worker_error_count?: number
          news_worker_status?: string | null
          next_expected_news_worker_run_at?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      official_disclosures: {
        Row: {
          category: string | null
          company_name: string | null
          created_at: string
          directness: string | null
          disclosure_type: string
          duplicate_cluster_id: string | null
          extracted_data: Json | null
          extracted_summary: string | null
          id: string
          impact_level: string
          impact_score: number
          is_high_impact: boolean
          news_article_id: string | null
          official_disclosure_linked: boolean
          published_at: string
          raw_payload: Json | null
          raw_text: string | null
          received_at: string | null
          related_news_ids: string[]
          risk_flag: string | null
          risk_flags: string[]
          sentiment: string
          source: string
          source_priority: number
          summary: string | null
          symbol: string
          title: string
          trading_relevance: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          category?: string | null
          company_name?: string | null
          created_at?: string
          directness?: string | null
          disclosure_type: string
          duplicate_cluster_id?: string | null
          extracted_data?: Json | null
          extracted_summary?: string | null
          id?: string
          impact_level?: string
          impact_score?: number
          is_high_impact?: boolean
          news_article_id?: string | null
          official_disclosure_linked?: boolean
          published_at?: string
          raw_payload?: Json | null
          raw_text?: string | null
          received_at?: string | null
          related_news_ids?: string[]
          risk_flag?: string | null
          risk_flags?: string[]
          sentiment?: string
          source: string
          source_priority?: number
          summary?: string | null
          symbol: string
          title: string
          trading_relevance?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          company_name?: string | null
          created_at?: string
          directness?: string | null
          disclosure_type?: string
          duplicate_cluster_id?: string | null
          extracted_data?: Json | null
          extracted_summary?: string | null
          id?: string
          impact_level?: string
          impact_score?: number
          is_high_impact?: boolean
          news_article_id?: string | null
          official_disclosure_linked?: boolean
          published_at?: string
          raw_payload?: Json | null
          raw_text?: string | null
          received_at?: string | null
          related_news_ids?: string[]
          risk_flag?: string | null
          risk_flags?: string[]
          sentiment?: string
          source?: string
          source_priority?: number
          summary?: string | null
          symbol?: string
          title?: string
          trading_relevance?: string | null
          updated_at?: string
          url?: string | null
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
          initial_balance: number | null
          reset_at: string | null
          user_id: string
        }
        Insert: {
          cash?: number
          created_at?: string
          currency?: string
          equity?: number
          id?: string
          initial_balance?: number | null
          reset_at?: string | null
          user_id: string
        }
        Update: {
          cash?: number
          created_at?: string
          currency?: string
          equity?: number
          id?: string
          initial_balance?: number | null
          reset_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      paper_orders: {
        Row: {
          account_id: string
          agent_id: string | null
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
          source: string | null
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
          agent_id?: string | null
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
          source?: string | null
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
          agent_id?: string | null
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
          source?: string | null
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
          opened_by_agent_id: string | null
          qty: number
          source: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          account_id: string
          avg_price: number
          id?: string
          opened_at?: string
          opened_by_agent_id?: string | null
          qty: number
          source?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          account_id?: string
          avg_price?: number
          id?: string
          opened_at?: string
          opened_by_agent_id?: string | null
          qty?: number
          source?: string | null
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
      portfolio_equity_snapshots: {
        Row: {
          cash: number
          created_at: string
          equity: number
          holdings_value: number
          id: string
          paper_account_id: string
          realized_pnl: number
          unrealized_pnl: number
        }
        Insert: {
          cash?: number
          created_at?: string
          equity?: number
          holdings_value?: number
          id?: string
          paper_account_id: string
          realized_pnl?: number
          unrealized_pnl?: number
        }
        Update: {
          cash?: number
          created_at?: string
          equity?: number
          holdings_value?: number
          id?: string
          paper_account_id?: string
          realized_pnl?: number
          unrealized_pnl?: number
        }
        Relationships: []
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
      portfolio_intelligence_snapshots: {
        Row: {
          account_id: string
          cash: number
          cash_drag_score: number
          cash_ratio: number
          concentration_score: number
          created_at: string
          critical_issues: Json
          daily_pnl: number
          disclosure_risk_exposure_pct: number
          diversification_score: number
          equity: number
          exposure_score: number
          holdings_value: number
          id: string
          insufficient_fundamental_exposure_pct: number
          invested_ratio: number
          market_regime: string | null
          max_drawdown: number
          portfolio_health_score: number
          positives: Json
          realized_pnl: number
          risk_level: string
          sector_risk_score: number
          summary: string | null
          total_return_pct: number
          unrealized_pnl: number
          user_id: string
          value_trap_exposure_pct: number
          warnings: Json
        }
        Insert: {
          account_id: string
          cash?: number
          cash_drag_score?: number
          cash_ratio?: number
          concentration_score?: number
          created_at?: string
          critical_issues?: Json
          daily_pnl?: number
          disclosure_risk_exposure_pct?: number
          diversification_score?: number
          equity?: number
          exposure_score?: number
          holdings_value?: number
          id?: string
          insufficient_fundamental_exposure_pct?: number
          invested_ratio?: number
          market_regime?: string | null
          max_drawdown?: number
          portfolio_health_score?: number
          positives?: Json
          realized_pnl?: number
          risk_level?: string
          sector_risk_score?: number
          summary?: string | null
          total_return_pct?: number
          unrealized_pnl?: number
          user_id: string
          value_trap_exposure_pct?: number
          warnings?: Json
        }
        Update: {
          account_id?: string
          cash?: number
          cash_drag_score?: number
          cash_ratio?: number
          concentration_score?: number
          created_at?: string
          critical_issues?: Json
          daily_pnl?: number
          disclosure_risk_exposure_pct?: number
          diversification_score?: number
          equity?: number
          exposure_score?: number
          holdings_value?: number
          id?: string
          insufficient_fundamental_exposure_pct?: number
          invested_ratio?: number
          market_regime?: string | null
          max_drawdown?: number
          portfolio_health_score?: number
          positives?: Json
          realized_pnl?: number
          risk_level?: string
          sector_risk_score?: number
          summary?: string | null
          total_return_pct?: number
          unrealized_pnl?: number
          user_id?: string
          value_trap_exposure_pct?: number
          warnings?: Json
        }
        Relationships: []
      }
      portfolio_risk_snapshots: {
        Row: {
          agent_id: string | null
          cash_pct: number
          cash_snapshot: number | null
          concentration_hhi: number
          created_at: string
          current_drawdown: number
          daily_pnl: number
          daily_pnl_pct: number
          equity_snapshot: number | null
          gross_exposure: number
          holdings_value_snapshot: number | null
          id: string
          max_position_weight: number
          net_exposure: number
          paper_account_id: string
          realized_pnl_snapshot: number | null
          risk_level: string
          sector_concentration: Json
          trades_today: number
          unrealized_pnl_snapshot: number | null
          warnings: Json
        }
        Insert: {
          agent_id?: string | null
          cash_pct?: number
          cash_snapshot?: number | null
          concentration_hhi?: number
          created_at?: string
          current_drawdown?: number
          daily_pnl?: number
          daily_pnl_pct?: number
          equity_snapshot?: number | null
          gross_exposure?: number
          holdings_value_snapshot?: number | null
          id?: string
          max_position_weight?: number
          net_exposure?: number
          paper_account_id: string
          realized_pnl_snapshot?: number | null
          risk_level?: string
          sector_concentration?: Json
          trades_today?: number
          unrealized_pnl_snapshot?: number | null
          warnings?: Json
        }
        Update: {
          agent_id?: string | null
          cash_pct?: number
          cash_snapshot?: number | null
          concentration_hhi?: number
          created_at?: string
          current_drawdown?: number
          daily_pnl?: number
          daily_pnl_pct?: number
          equity_snapshot?: number | null
          gross_exposure?: number
          holdings_value_snapshot?: number | null
          id?: string
          max_position_weight?: number
          net_exposure?: number
          paper_account_id?: string
          realized_pnl_snapshot?: number | null
          risk_level?: string
          sector_concentration?: Json
          trades_today?: number
          unrealized_pnl_snapshot?: number | null
          warnings?: Json
        }
        Relationships: []
      }
      portfolio_scenario_results: {
        Row: {
          account_id: string
          confidence: string
          created_at: string
          estimated_equity: number | null
          estimated_pnl: number | null
          estimated_pnl_pct: number | null
          id: string
          input_payload: Json
          notes: Json
          result_payload: Json
          risk_level_after: string | null
          risk_level_before: string | null
          scenario_name: string
          scenario_type: string
          user_id: string
        }
        Insert: {
          account_id: string
          confidence?: string
          created_at?: string
          estimated_equity?: number | null
          estimated_pnl?: number | null
          estimated_pnl_pct?: number | null
          id?: string
          input_payload?: Json
          notes?: Json
          result_payload?: Json
          risk_level_after?: string | null
          risk_level_before?: string | null
          scenario_name: string
          scenario_type: string
          user_id: string
        }
        Update: {
          account_id?: string
          confidence?: string
          created_at?: string
          estimated_equity?: number | null
          estimated_pnl?: number | null
          estimated_pnl_pct?: number | null
          id?: string
          input_payload?: Json
          notes?: Json
          result_payload?: Json
          risk_level_after?: string | null
          risk_level_before?: string | null
          scenario_name?: string
          scenario_type?: string
          user_id?: string
        }
        Relationships: []
      }
      position_attribution_snapshots: {
        Row: {
          account_id: string
          avg_entry: number
          beta_estimate: number | null
          beta_source: string | null
          contribution_to_return: number
          contribution_to_risk: number
          created_at: string
          disclosure_risk_flags: string[]
          fundamental_label: string | null
          id: string
          last_price: number
          market_value: number
          position_id: string | null
          position_weight_pct: number
          quantity: number
          risk_level: string
          sector: string | null
          symbol: string
          unrealized_pnl: number
          unrealized_pnl_pct: number
          user_id: string
          value_trap_risk: string | null
          volatility_estimate: number | null
        }
        Insert: {
          account_id: string
          avg_entry?: number
          beta_estimate?: number | null
          beta_source?: string | null
          contribution_to_return?: number
          contribution_to_risk?: number
          created_at?: string
          disclosure_risk_flags?: string[]
          fundamental_label?: string | null
          id?: string
          last_price?: number
          market_value?: number
          position_id?: string | null
          position_weight_pct?: number
          quantity?: number
          risk_level?: string
          sector?: string | null
          symbol: string
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          user_id: string
          value_trap_risk?: string | null
          volatility_estimate?: number | null
        }
        Update: {
          account_id?: string
          avg_entry?: number
          beta_estimate?: number | null
          beta_source?: string | null
          contribution_to_return?: number
          contribution_to_risk?: number
          created_at?: string
          disclosure_risk_flags?: string[]
          fundamental_label?: string | null
          id?: string
          last_price?: number
          market_value?: number
          position_id?: string | null
          position_weight_pct?: number
          quantity?: number
          risk_level?: string
          sector?: string | null
          symbol?: string
          unrealized_pnl?: number
          unrealized_pnl_pct?: number
          user_id?: string
          value_trap_risk?: string | null
          volatility_estimate?: number | null
        }
        Relationships: []
      }
      position_exit_plans: {
        Row: {
          account_id: string
          agent_id: string | null
          avg_entry: number | null
          confidence: number
          created_at: string
          current_price: number | null
          entry_price: number | null
          exit_condition: string | null
          highest_price_since_entry: number | null
          hold_condition: string | null
          id: string
          invalidation_level: number | null
          last_evaluated_at: string | null
          lot: number | null
          management_status: string
          max_loss_amount: number | null
          position_id: string | null
          quantity: number | null
          reason: string | null
          reduce_condition: string | null
          risk_reward_ratio: number | null
          stop_loss: number | null
          strategy_name: string | null
          symbol: string
          take_profit: number | null
          target_profit_amount: number | null
          trailing_stop: number | null
          trailing_stop_pct: number | null
          updated_at: string
          warnings: string[]
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          avg_entry?: number | null
          confidence?: number
          created_at?: string
          current_price?: number | null
          entry_price?: number | null
          exit_condition?: string | null
          highest_price_since_entry?: number | null
          hold_condition?: string | null
          id?: string
          invalidation_level?: number | null
          last_evaluated_at?: string | null
          lot?: number | null
          management_status?: string
          max_loss_amount?: number | null
          position_id?: string | null
          quantity?: number | null
          reason?: string | null
          reduce_condition?: string | null
          risk_reward_ratio?: number | null
          stop_loss?: number | null
          strategy_name?: string | null
          symbol: string
          take_profit?: number | null
          target_profit_amount?: number | null
          trailing_stop?: number | null
          trailing_stop_pct?: number | null
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          avg_entry?: number | null
          confidence?: number
          created_at?: string
          current_price?: number | null
          entry_price?: number | null
          exit_condition?: string | null
          highest_price_since_entry?: number | null
          hold_condition?: string | null
          id?: string
          invalidation_level?: number | null
          last_evaluated_at?: string | null
          lot?: number | null
          management_status?: string
          max_loss_amount?: number | null
          position_id?: string | null
          quantity?: number | null
          reason?: string | null
          reduce_condition?: string | null
          risk_reward_ratio?: number | null
          stop_loss?: number | null
          strategy_name?: string | null
          symbol?: string
          take_profit?: number | null
          target_profit_amount?: number | null
          trailing_stop?: number | null
          trailing_stop_pct?: number | null
          updated_at?: string
          warnings?: string[]
        }
        Relationships: []
      }
      position_monitoring_snapshots: {
        Row: {
          account_id: string
          action: string | null
          agent_id: string | null
          created_at: string
          current_price: number | null
          exit_score: number | null
          hold_score: number | null
          id: string
          management_status: string | null
          market_session: string | null
          position_id: string | null
          reasons: Json
          reduce_score: number | null
          symbol: string
          unrealized_pnl: number | null
          unrealized_pnl_pct: number | null
          warnings: Json
        }
        Insert: {
          account_id: string
          action?: string | null
          agent_id?: string | null
          created_at?: string
          current_price?: number | null
          exit_score?: number | null
          hold_score?: number | null
          id?: string
          management_status?: string | null
          market_session?: string | null
          position_id?: string | null
          reasons?: Json
          reduce_score?: number | null
          symbol: string
          unrealized_pnl?: number | null
          unrealized_pnl_pct?: number | null
          warnings?: Json
        }
        Update: {
          account_id?: string
          action?: string | null
          agent_id?: string | null
          created_at?: string
          current_price?: number | null
          exit_score?: number | null
          hold_score?: number | null
          id?: string
          management_status?: string | null
          market_session?: string | null
          position_id?: string | null
          reasons?: Json
          reduce_score?: number | null
          symbol?: string
          unrealized_pnl?: number | null
          unrealized_pnl_pct?: number | null
          warnings?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          demo_mode: boolean
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          must_change_password: boolean
          onboarding_completed: boolean
          status: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          demo_mode?: boolean
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          must_change_password?: boolean
          onboarding_completed?: boolean
          status?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          demo_mode?: boolean
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          must_change_password?: boolean
          onboarding_completed?: boolean
          status?: string
          updated_at?: string
          username?: string | null
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
      regulatory_events: {
        Row: {
          company_name: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          impact_score: number
          published_at: string
          raw_payload: Json | null
          risk_flags: string[]
          severity: string
          source: string
          source_url: string | null
          status: string
          symbol: string
          title: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          impact_score?: number
          published_at?: string
          raw_payload?: Json | null
          risk_flags?: string[]
          severity?: string
          source: string
          source_url?: string | null
          status?: string
          symbol: string
          title: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          impact_score?: number
          published_at?: string
          raw_payload?: Json | null
          risk_flags?: string[]
          severity?: string
          source?: string
          source_url?: string | null
          status?: string
          symbol?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      sector_fundamental_benchmarks: {
        Row: {
          as_of: string
          avg_der: number | null
          avg_pbv: number | null
          avg_per: number | null
          avg_roe: number | null
          benchmark_confidence: string
          created_at: string
          excluded_symbols: string[] | null
          id: string
          included_symbols: string[] | null
          median_der: number | null
          median_dividend_yield: number | null
          median_eps_growth_yoy: number | null
          median_net_income_growth_yoy: number | null
          median_pbv: number | null
          median_per: number | null
          median_profit_growth: number | null
          median_revenue_growth: number | null
          median_revenue_growth_yoy: number | null
          median_roe: number | null
          sample_size: number
          sector: string
          updated_at: string
        }
        Insert: {
          as_of?: string
          avg_der?: number | null
          avg_pbv?: number | null
          avg_per?: number | null
          avg_roe?: number | null
          benchmark_confidence?: string
          created_at?: string
          excluded_symbols?: string[] | null
          id?: string
          included_symbols?: string[] | null
          median_der?: number | null
          median_dividend_yield?: number | null
          median_eps_growth_yoy?: number | null
          median_net_income_growth_yoy?: number | null
          median_pbv?: number | null
          median_per?: number | null
          median_profit_growth?: number | null
          median_revenue_growth?: number | null
          median_revenue_growth_yoy?: number | null
          median_roe?: number | null
          sample_size?: number
          sector: string
          updated_at?: string
        }
        Update: {
          as_of?: string
          avg_der?: number | null
          avg_pbv?: number | null
          avg_per?: number | null
          avg_roe?: number | null
          benchmark_confidence?: string
          created_at?: string
          excluded_symbols?: string[] | null
          id?: string
          included_symbols?: string[] | null
          median_der?: number | null
          median_dividend_yield?: number | null
          median_eps_growth_yoy?: number | null
          median_net_income_growth_yoy?: number | null
          median_pbv?: number | null
          median_per?: number | null
          median_profit_growth?: number | null
          median_revenue_growth?: number | null
          median_revenue_growth_yoy?: number | null
          median_roe?: number | null
          sample_size?: number
          sector?: string
          updated_at?: string
        }
        Relationships: []
      }
      sector_strength_snapshots: {
        Row: {
          breadth_score: number
          classification: string
          created_at: string
          id: string
          momentum_score: number
          reasoning: string | null
          relative_strength: number
          sector: string
          top_symbols: Json
        }
        Insert: {
          breadth_score?: number
          classification?: string
          created_at?: string
          id?: string
          momentum_score?: number
          reasoning?: string | null
          relative_strength?: number
          sector: string
          top_symbols?: Json
        }
        Update: {
          breadth_score?: number
          classification?: string
          created_at?: string
          id?: string
          momentum_score?: number
          reasoning?: string | null
          relative_strength?: number
          sector?: string
          top_symbols?: Json
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
          average_volume: number | null
          book_value_per_share: number | null
          company_name: string | null
          confidence_label: string | null
          created_at: string
          currency: string
          data_freshness: string
          data_source: string | null
          data_status: string
          der: number | null
          dividend_payout_ratio: number | null
          dividend_per_share: number | null
          dividend_yield: number | null
          eps: number | null
          eps_growth_yoy: number | null
          financial_report_date: string | null
          free_cash_flow: number | null
          freshness_status: string
          gross_margin: number | null
          historical_pbv_avg: number | null
          historical_per_avg: number | null
          id: string
          industry: string | null
          last_fundamental_fetch_at: string | null
          last_market_fetch_at: string | null
          market_cap: number | null
          missing_fields: string[]
          missing_reason: Json
          net_margin: number | null
          net_profit: number | null
          net_profit_growth_yoy: number | null
          operating_cash_flow: number | null
          pbv: number | null
          per: number | null
          price: number | null
          price_last: number | null
          raw_payload: Json | null
          reporting_period: string | null
          revenue: number | null
          revenue_growth_yoy: number | null
          roa: number | null
          roe: number | null
          sector: string | null
          sector_pbv_avg: number | null
          sector_per_avg: number | null
          sector_roe_avg: number | null
          shares_outstanding: number | null
          source_confidence: number | null
          source_count: number
          source_payload_id: string | null
          source_primary: string | null
          status: string
          symbol: string
          total_assets: number | null
          total_debt: number | null
          total_equity: number | null
          updated_at: string
          validation_notes: string[]
          volume: number | null
        }
        Insert: {
          average_volume?: number | null
          book_value_per_share?: number | null
          company_name?: string | null
          confidence_label?: string | null
          created_at?: string
          currency?: string
          data_freshness?: string
          data_source?: string | null
          data_status?: string
          der?: number | null
          dividend_payout_ratio?: number | null
          dividend_per_share?: number | null
          dividend_yield?: number | null
          eps?: number | null
          eps_growth_yoy?: number | null
          financial_report_date?: string | null
          free_cash_flow?: number | null
          freshness_status?: string
          gross_margin?: number | null
          historical_pbv_avg?: number | null
          historical_per_avg?: number | null
          id?: string
          industry?: string | null
          last_fundamental_fetch_at?: string | null
          last_market_fetch_at?: string | null
          market_cap?: number | null
          missing_fields?: string[]
          missing_reason?: Json
          net_margin?: number | null
          net_profit?: number | null
          net_profit_growth_yoy?: number | null
          operating_cash_flow?: number | null
          pbv?: number | null
          per?: number | null
          price?: number | null
          price_last?: number | null
          raw_payload?: Json | null
          reporting_period?: string | null
          revenue?: number | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          sector?: string | null
          sector_pbv_avg?: number | null
          sector_per_avg?: number | null
          sector_roe_avg?: number | null
          shares_outstanding?: number | null
          source_confidence?: number | null
          source_count?: number
          source_payload_id?: string | null
          source_primary?: string | null
          status?: string
          symbol: string
          total_assets?: number | null
          total_debt?: number | null
          total_equity?: number | null
          updated_at?: string
          validation_notes?: string[]
          volume?: number | null
        }
        Update: {
          average_volume?: number | null
          book_value_per_share?: number | null
          company_name?: string | null
          confidence_label?: string | null
          created_at?: string
          currency?: string
          data_freshness?: string
          data_source?: string | null
          data_status?: string
          der?: number | null
          dividend_payout_ratio?: number | null
          dividend_per_share?: number | null
          dividend_yield?: number | null
          eps?: number | null
          eps_growth_yoy?: number | null
          financial_report_date?: string | null
          free_cash_flow?: number | null
          freshness_status?: string
          gross_margin?: number | null
          historical_pbv_avg?: number | null
          historical_per_avg?: number | null
          id?: string
          industry?: string | null
          last_fundamental_fetch_at?: string | null
          last_market_fetch_at?: string | null
          market_cap?: number | null
          missing_fields?: string[]
          missing_reason?: Json
          net_margin?: number | null
          net_profit?: number | null
          net_profit_growth_yoy?: number | null
          operating_cash_flow?: number | null
          pbv?: number | null
          per?: number | null
          price?: number | null
          price_last?: number | null
          raw_payload?: Json | null
          reporting_period?: string | null
          revenue?: number | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          sector?: string | null
          sector_pbv_avg?: number | null
          sector_per_avg?: number | null
          sector_roe_avg?: number | null
          shares_outstanding?: number | null
          source_confidence?: number | null
          source_count?: number
          source_payload_id?: string | null
          source_primary?: string | null
          status?: string
          symbol?: string
          total_assets?: number | null
          total_debt?: number | null
          total_equity?: number | null
          updated_at?: string
          validation_notes?: string[]
          volume?: number | null
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
      strategy_backtest_results: {
        Row: {
          avg_holding_period: number | null
          avg_return: number
          best_trade: number | null
          created_at: string
          id: string
          market_regime: string | null
          max_drawdown: number
          median_return: number | null
          profit_factor: number
          sample_quality: string
          sector: string | null
          sharpe_like_score: number | null
          strategy_name: string
          symbol: string
          tested_from: string | null
          tested_to: string | null
          timeframe: string | null
          total_trades: number
          win_rate: number
          worst_trade: number | null
        }
        Insert: {
          avg_holding_period?: number | null
          avg_return?: number
          best_trade?: number | null
          created_at?: string
          id?: string
          market_regime?: string | null
          max_drawdown?: number
          median_return?: number | null
          profit_factor?: number
          sample_quality?: string
          sector?: string | null
          sharpe_like_score?: number | null
          strategy_name: string
          symbol: string
          tested_from?: string | null
          tested_to?: string | null
          timeframe?: string | null
          total_trades?: number
          win_rate?: number
          worst_trade?: number | null
        }
        Update: {
          avg_holding_period?: number | null
          avg_return?: number
          best_trade?: number | null
          created_at?: string
          id?: string
          market_regime?: string | null
          max_drawdown?: number
          median_return?: number | null
          profit_factor?: number
          sample_quality?: string
          sector?: string | null
          sharpe_like_score?: number | null
          strategy_name?: string
          symbol?: string
          tested_from?: string | null
          tested_to?: string | null
          timeframe?: string | null
          total_trades?: number
          win_rate?: number
          worst_trade?: number | null
        }
        Relationships: []
      }
      strategy_forward_test_results: {
        Row: {
          close_reason: string | null
          created_at: string
          holding_duration_minutes: number | null
          id: string
          market_regime: string | null
          paper_order_id: string | null
          realized_pnl: number | null
          realized_pnl_pct: number | null
          result: string
          sector: string | null
          strategy_name: string
          symbol: string
          training_event_id: string | null
        }
        Insert: {
          close_reason?: string | null
          created_at?: string
          holding_duration_minutes?: number | null
          id?: string
          market_regime?: string | null
          paper_order_id?: string | null
          realized_pnl?: number | null
          realized_pnl_pct?: number | null
          result?: string
          sector?: string | null
          strategy_name: string
          symbol: string
          training_event_id?: string | null
        }
        Update: {
          close_reason?: string | null
          created_at?: string
          holding_duration_minutes?: number | null
          id?: string
          market_regime?: string | null
          paper_order_id?: string | null
          realized_pnl?: number | null
          realized_pnl_pct?: number | null
          result?: string
          sector?: string | null
          strategy_name?: string
          symbol?: string
          training_event_id?: string | null
        }
        Relationships: []
      }
      strategy_health: {
        Row: {
          agent_id: string
          avg_return: number
          consec_losses: number
          created_at: string
          gross_loss: number
          gross_profit: number
          id: string
          last_trade_at: string | null
          losses: number
          paused_at: string | null
          paused_reason: string | null
          profit_factor: number
          status: string
          strategy: string
          trades: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          agent_id: string
          avg_return?: number
          consec_losses?: number
          created_at?: string
          gross_loss?: number
          gross_profit?: number
          id?: string
          last_trade_at?: string | null
          losses?: number
          paused_at?: string | null
          paused_reason?: string | null
          profit_factor?: number
          status?: string
          strategy: string
          trades?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          agent_id?: string
          avg_return?: number
          consec_losses?: number
          created_at?: string
          gross_loss?: number
          gross_profit?: number
          id?: string
          last_trade_at?: string | null
          losses?: number
          paused_at?: string | null
          paused_reason?: string | null
          profit_factor?: number
          status?: string
          strategy?: string
          trades?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      swing_trade_plans: {
        Row: {
          agent_id: string
          blocked_reason: string | null
          closed_at: string | null
          created_at: string
          decision_id: string | null
          entry_price: number | null
          entry_type: string
          entry_zone_high: number | null
          entry_zone_low: number | null
          exit_reason: string | null
          id: string
          invalidation_level: number | null
          market_regime: string | null
          max_holding_days: number
          min_holding_until: string | null
          paper_account_id: string
          position_id: string | null
          realized_pnl: number | null
          realized_pnl_pct: number | null
          reasons: string[]
          risk_reward_ratio: number | null
          status: string
          stop_loss: number | null
          strategy: string | null
          swing_quality_score: number | null
          symbol: string
          take_profit_1: number | null
          take_profit_2: number | null
          target_holding_days: number
          time_stop_at: string | null
          trailing_active: boolean
          trailing_stop: number | null
          updated_at: string
          warnings: string[]
        }
        Insert: {
          agent_id: string
          blocked_reason?: string | null
          closed_at?: string | null
          created_at?: string
          decision_id?: string | null
          entry_price?: number | null
          entry_type: string
          entry_zone_high?: number | null
          entry_zone_low?: number | null
          exit_reason?: string | null
          id?: string
          invalidation_level?: number | null
          market_regime?: string | null
          max_holding_days?: number
          min_holding_until?: string | null
          paper_account_id: string
          position_id?: string | null
          realized_pnl?: number | null
          realized_pnl_pct?: number | null
          reasons?: string[]
          risk_reward_ratio?: number | null
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          swing_quality_score?: number | null
          symbol: string
          take_profit_1?: number | null
          take_profit_2?: number | null
          target_holding_days?: number
          time_stop_at?: string | null
          trailing_active?: boolean
          trailing_stop?: number | null
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          agent_id?: string
          blocked_reason?: string | null
          closed_at?: string | null
          created_at?: string
          decision_id?: string | null
          entry_price?: number | null
          entry_type?: string
          entry_zone_high?: number | null
          entry_zone_low?: number | null
          exit_reason?: string | null
          id?: string
          invalidation_level?: number | null
          market_regime?: string | null
          max_holding_days?: number
          min_holding_until?: string | null
          paper_account_id?: string
          position_id?: string | null
          realized_pnl?: number | null
          realized_pnl_pct?: number | null
          reasons?: string[]
          risk_reward_ratio?: number | null
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          swing_quality_score?: number | null
          symbol?: string
          take_profit_1?: number | null
          take_profit_2?: number | null
          target_holding_days?: number
          time_stop_at?: string | null
          trailing_active?: boolean
          trailing_stop?: number | null
          updated_at?: string
          warnings?: string[]
        }
        Relationships: []
      }
      symbol_trade_cooldowns: {
        Row: {
          agent_id: string
          cooldown_until: string | null
          created_at: string
          id: string
          last_loss_at: string | null
          loss_count: number
          reason: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          cooldown_until?: string | null
          created_at?: string
          id?: string
          last_loss_at?: string | null
          loss_count?: number
          reason?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          cooldown_until?: string | null
          created_at?: string
          id?: string
          last_loss_at?: string | null
          loss_count?: number
          reason?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_audit_checks: {
        Row: {
          audit_report_id: string | null
          check_key: string
          created_at: string
          details: Json
          id: string
          message: string | null
          module: string
          recommended_fix: string | null
          severity: string
          status: string
        }
        Insert: {
          audit_report_id?: string | null
          check_key: string
          created_at?: string
          details?: Json
          id?: string
          message?: string | null
          module: string
          recommended_fix?: string | null
          severity?: string
          status?: string
        }
        Update: {
          audit_report_id?: string | null
          check_key?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string | null
          module?: string
          recommended_fix?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_audit_checks_audit_report_id_fkey"
            columns: ["audit_report_id"]
            isOneToOne: false
            referencedRelation: "system_audit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      system_audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string | null
          metadata: Json
          module: string
          status: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          module: string
          status?: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          module?: string
          status?: string
        }
        Relationships: []
      }
      system_audit_reports: {
        Row: {
          auto_fix_available: Json
          created_at: string
          critical_issues: Json
          duration_ms: number | null
          error_message: string | null
          failed_checks: Json
          id: string
          modules: Json
          overall_score: number
          passed_checks: Json
          recommended_fixes: Json
          status: string
          trigger_source: string
          warnings: Json
        }
        Insert: {
          auto_fix_available?: Json
          created_at?: string
          critical_issues?: Json
          duration_ms?: number | null
          error_message?: string | null
          failed_checks?: Json
          id?: string
          modules?: Json
          overall_score?: number
          passed_checks?: Json
          recommended_fixes?: Json
          status?: string
          trigger_source?: string
          warnings?: Json
        }
        Update: {
          auto_fix_available?: Json
          created_at?: string
          critical_issues?: Json
          duration_ms?: number | null
          error_message?: string | null
          failed_checks?: Json
          id?: string
          modules?: Json
          overall_score?: number
          passed_checks?: Json
          recommended_fixes?: Json
          status?: string
          trigger_source?: string
          warnings?: Json
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
      user_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
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
      user_settings: {
        Row: {
          ai_agent_mode: string
          created_at: string
          currency: string
          id: string
          language: string
          risk_profile: string
          theme: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_agent_mode?: string
          created_at?: string
          currency?: string
          id?: string
          language?: string
          risk_profile?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_agent_mode?: string
          created_at?: string
          currency?: string
          id?: string
          language?: string
          risk_profile?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      valuation_metrics: {
        Row: {
          as_of: string
          book_value_growth_yoy: number | null
          book_value_growth_yoy_v2: number | null
          calculation_method: string | null
          created_at: string
          current_ratio: number | null
          debt_to_assets: number | null
          der: number | null
          dividend_consistency_score: number | null
          dividend_per_share: number | null
          dividend_yield: number | null
          eps_growth_yoy: number | null
          equity_growth_yoy: number | null
          ev_ebitda: number | null
          fcf_yield: number | null
          gpm: number | null
          id: string
          market_cap: number | null
          net_income_growth_yoy: number | null
          npm: number | null
          operating_cashflow_margin: number | null
          opm: number | null
          payout_ratio: number | null
          pbv: number | null
          per: number | null
          price: number | null
          ps: number | null
          quick_ratio: number | null
          raw_payload: Json | null
          revenue_growth_yoy: number | null
          roa: number | null
          roe: number | null
          sector: string | null
          shares_outstanding: number | null
          source: string
          source_url: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          as_of?: string
          book_value_growth_yoy?: number | null
          book_value_growth_yoy_v2?: number | null
          calculation_method?: string | null
          created_at?: string
          current_ratio?: number | null
          debt_to_assets?: number | null
          der?: number | null
          dividend_consistency_score?: number | null
          dividend_per_share?: number | null
          dividend_yield?: number | null
          eps_growth_yoy?: number | null
          equity_growth_yoy?: number | null
          ev_ebitda?: number | null
          fcf_yield?: number | null
          gpm?: number | null
          id?: string
          market_cap?: number | null
          net_income_growth_yoy?: number | null
          npm?: number | null
          operating_cashflow_margin?: number | null
          opm?: number | null
          payout_ratio?: number | null
          pbv?: number | null
          per?: number | null
          price?: number | null
          ps?: number | null
          quick_ratio?: number | null
          raw_payload?: Json | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          sector?: string | null
          shares_outstanding?: number | null
          source: string
          source_url?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          as_of?: string
          book_value_growth_yoy?: number | null
          book_value_growth_yoy_v2?: number | null
          calculation_method?: string | null
          created_at?: string
          current_ratio?: number | null
          debt_to_assets?: number | null
          der?: number | null
          dividend_consistency_score?: number | null
          dividend_per_share?: number | null
          dividend_yield?: number | null
          eps_growth_yoy?: number | null
          equity_growth_yoy?: number | null
          ev_ebitda?: number | null
          fcf_yield?: number | null
          gpm?: number | null
          id?: string
          market_cap?: number | null
          net_income_growth_yoy?: number | null
          npm?: number | null
          operating_cashflow_margin?: number | null
          opm?: number | null
          payout_ratio?: number | null
          pbv?: number | null
          per?: number | null
          price?: number | null
          ps?: number | null
          quick_ratio?: number | null
          raw_payload?: Json | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          sector?: string | null
          shares_outstanding?: number | null
          source?: string
          source_url?: string | null
          symbol?: string
          updated_at?: string
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_suspended: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin" | "suspended"
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
      app_role: ["admin", "user", "super_admin", "suspended"],
    },
  },
} as const

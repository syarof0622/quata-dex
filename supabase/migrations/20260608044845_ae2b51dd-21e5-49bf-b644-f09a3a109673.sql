DROP POLICY IF EXISTS auth_read_fundamental_source_logs ON public.fundamental_source_logs;
CREATE POLICY fundamental_source_logs_admin_read
ON public.fundamental_source_logs
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS auth_read_strategy_forward ON public.strategy_forward_test_results;
CREATE POLICY strategy_forward_results_owner_or_admin_read
ON public.strategy_forward_test_results
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    paper_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.paper_orders po
      WHERE po.id = strategy_forward_test_results.paper_order_id
        AND po.user_id = auth.uid()
    )
  )
  OR (
    training_event_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.ai_agent_training_events te
      JOIN public.ai_trade_agents ata ON ata.id = te.agent_id
      WHERE te.id = strategy_forward_test_results.training_event_id
        AND ata.user_id = auth.uid()
    )
  )
);
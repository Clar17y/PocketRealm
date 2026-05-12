import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  getAdminApiLatencyActions,
  getAdminApiLatencyReport,
  getAdminBalanceAnalytics,
  getAdminSchedulerStatus,
} from '../../services/admin/diagnosticsAdminService';

const balancePeriodSchema = z.object({
  period: z.enum(['1h', '24h', '7d', '30d']).default('7d'),
});

const apiLatencyQuerySchema = z.object({
  period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('1h'),
  action: z.string().max(64).optional(),
});

const apiLatencyActionsQuerySchema = z.object({
  period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('1h'),
});

export function registerDiagnosticsAdminRoutes(router: Router): void {
  router.get('/scheduler-status', asyncHandler(async (_req, res) => {
    const status = await getAdminSchedulerStatus();
    res.json(status);
  }));

  router.get('/analytics/balance', asyncHandler(async (req, res) => {
    const { period } = balancePeriodSchema.parse(req.query);
    const report = await getAdminBalanceAnalytics(period);
    res.json(report);
  }));

  router.get('/analytics/latency', asyncHandler(async (req, res) => {
    const query = apiLatencyQuerySchema.parse(req.query);
    const report = await getAdminApiLatencyReport(query);
    res.json(report);
  }));

  router.get('/analytics/latency/actions', asyncHandler(async (req, res) => {
    const { period } = apiLatencyActionsQuerySchema.parse(req.query);
    const actions = await getAdminApiLatencyActions(period);
    res.json({ actions });
  }));
}

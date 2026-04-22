import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  getAdminBalanceAnalytics,
  getAdminSchedulerStatus,
} from '../../services/admin/diagnosticsAdminService';

const balancePeriodSchema = z.object({
  period: z.enum(['1h', '24h', '7d', '30d']).default('7d'),
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
}

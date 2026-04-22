import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { registerDiagnosticsAdminRoutes } from './admin/diagnostics';
import { registerEventAdminRoutes } from './admin/events';
import { registerGuildAdminRoutes } from './admin/guild';
import { registerItemAdminRoutes } from './admin/items';
import { registerPlayerAdminRoutes } from './admin/player';
import { registerWorldAdminRoutes } from './admin/world';

export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);

registerPlayerAdminRoutes(adminRouter);
registerItemAdminRoutes(adminRouter);
registerEventAdminRoutes(adminRouter);
registerWorldAdminRoutes(adminRouter);
registerGuildAdminRoutes(adminRouter);
registerDiagnosticsAdminRoutes(adminRouter);

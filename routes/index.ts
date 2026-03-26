import { Router } from 'express';
import authRoutes from '../modules/auth/routes.js';
import adminRoutes from '../modules/admin/routes.js';
import customerRoutes from '../modules/customer/routes.js';
import managerRoutes from '../modules/manager/routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/customer', customerRoutes);
apiRouter.use('/manager', managerRoutes);

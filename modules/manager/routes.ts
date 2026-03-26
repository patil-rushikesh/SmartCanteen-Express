import { Router } from 'express';
import {
  createManagerMenuItem,
  deleteManagerMenuItem,
  listManagerMenu,
  listManagerOrders,
  managerPaymentReport,
  scanOrderQr,
  updateManagerMenuItem,
  updateManagerOrderStatus
} from '../../controllers/managerController/index.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { requireTenantContext, resolveTenantContext } from '../../middlewares/tenant-context.js';
import { validateRequest } from '../../middlewares/validate-request.js';
import { menuFilterSchema, menuItemIdParamSchema, menuItemSchema, menuItemUpdateSchema } from '../../models/menu.js';
import { managerOrderStatusSchema, orderIdParamSchema, scanQrSchema } from '../../models/order.js';
import { RoleCode } from '../../models/domain.js';

const router = Router();

router.use(authenticate, authorize(RoleCode.CANTEEN_MANAGER), resolveTenantContext, requireTenantContext);

router.get('/menu-items', validateRequest({ query: menuFilterSchema }), listManagerMenu);
router.post('/menu-items', validateRequest({ body: menuItemSchema }), createManagerMenuItem);
router.put(
  '/menu-items/:menuItemId',
  validateRequest({ params: menuItemIdParamSchema, body: menuItemUpdateSchema }),
  updateManagerMenuItem
);
router.delete('/menu-items/:menuItemId', validateRequest({ params: menuItemIdParamSchema }), deleteManagerMenuItem);
router.get('/orders', listManagerOrders);
router.post('/orders/scan-qr', validateRequest({ body: scanQrSchema }), scanOrderQr);
router.patch(
  '/orders/:orderId/status',
  validateRequest({ params: orderIdParamSchema, body: managerOrderStatusSchema }),
  updateManagerOrderStatus
);
router.get('/payments/report', managerPaymentReport);

export default router;

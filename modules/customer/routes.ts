import { Router } from 'express';
import {
  browseMenu,
  clearCart,
  createOrder,
  getCart,
  getOrderQr,
  listOrders,
  reportIssue,
  setCart
} from '../../controllers/customerController/index.js';
import { initiatePayment, verifyPayment } from '../../controllers/paymentController/index.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { requireTenantContext, resolveTenantContext } from '../../middlewares/tenant-context.js';
import { validateRequest } from '../../middlewares/validate-request.js';
import { cartSchema, createOrderSchema, initiatePaymentSchema, orderIdParamSchema, reportIssueSchema, verifyPaymentSchema } from '../../models/order.js';
import { menuFilterSchema } from '../../models/menu.js';
import { RoleCode } from '../../models/domain.js';

const router = Router();

router.use(authenticate, authorize(RoleCode.CUSTOMER), resolveTenantContext, requireTenantContext);

router.get('/menu', validateRequest({ query: menuFilterSchema }), browseMenu);
router.get('/cart', getCart);
router.put('/cart', validateRequest({ body: cartSchema }), setCart);
router.delete('/cart', clearCart);
router.post('/orders', validateRequest({ body: createOrderSchema }), createOrder);
router.get('/orders', listOrders);
router.get('/orders/:orderId/qr', validateRequest({ params: orderIdParamSchema }), getOrderQr);
router.post(
  '/orders/:orderId/payments/initiate',
  validateRequest({ params: orderIdParamSchema, body: initiatePaymentSchema }),
  initiatePayment
);
router.post('/payments/verify', validateRequest({ body: verifyPaymentSchema }), verifyPayment);
router.post(
  '/orders/:orderId/issues',
  validateRequest({ params: orderIdParamSchema, body: reportIssueSchema }),
  reportIssue
);

export default router;

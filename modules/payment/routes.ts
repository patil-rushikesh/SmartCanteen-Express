import { Router, raw } from 'express';
import { razorpayWebhook } from '../../controllers/paymentController/index.js';

const router = Router();

router.post('/razorpay', raw({ type: 'application/json' }), razorpayWebhook);

export default router;

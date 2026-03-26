import { Request, Response } from 'express';
import { container } from '../../lib/container.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const initiatePayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await container.paymentService.initiateOrderPayment({
    tenantId: req.tenantId!,
    customerId: req.user!.userId,
    orderId: req.params.orderId.toString(),
    idempotencyKey: req.body.idempotencyKey
  });

  res.status(200).json({ success: true, data: payment });
});

export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const result = await container.paymentService.verifyPaymentSignature(req.body);
  res.status(200).json({ success: true, data: result });
});

export const razorpayWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature']?.toString();
  if (!signature) {
    return res.status(400).json({ success: false, message: 'Missing webhook signature' });
  }

  const result = await container.paymentService.handleWebhook({
    signature,
    rawBody: req.body.toString('utf8')
  });

  res.status(200).json({ success: true, data: result });
});

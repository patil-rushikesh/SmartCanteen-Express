import { randomUUID } from 'node:crypto';
import type {
  InitiatePaymentInput, PaymentProvider, PaymentWebhookEvent,
  RefundPaymentInput, VerifyPaymentInput
} from '../../interfaces/payment-provider.js';

/** Exam simulation only. Selected explicitly by PAYMENT_PROVIDER_MODE=fake. */
export class FakePaymentProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput) {
    return {
      providerOrderId: `exam_order_${randomUUID()}`,
      amountInPaise: input.amountInPaise,
      currency: input.currency,
      receipt: input.receipt,
      raw: { mode: 'fake', simulated: true }
    };
  }

  verifyPayment(input: VerifyPaymentInput) {
    return input.providerOrderId.startsWith('exam_order_') &&
      input.providerPaymentId.startsWith('exam_pay_') &&
      input.signature === 'exam_fake_payment';
  }

  async refundPayment(input: RefundPaymentInput) {
    if (!input.providerPaymentId.startsWith('exam_pay_')) {
      throw new Error('Fake provider only accepts exam payment IDs');
    }
    return { refundId: `exam_refund_${randomUUID()}`, raw: { mode: 'fake', simulated: true } };
  }

  verifyWebhookSignature() { return false; }
  parseWebhook(): PaymentWebhookEvent { throw new Error('Fake payments do not accept webhooks'); }
}

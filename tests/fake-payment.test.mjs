import assert from 'node:assert/strict';
import test from 'node:test';
import { FakePaymentProvider } from '../dist/services/payments/fake-payment-provider.js';

test('exam provider simulates payments and refuses real IDs or webhooks', async () => {
  const provider = new FakePaymentProvider();
  const order = await provider.initiatePayment({ amountInPaise: 1500, currency: 'INR', receipt: 'exam', notes: {} });
  assert.equal(order.amountInPaise, 1500);
  const payment = { providerOrderId: order.providerOrderId, providerPaymentId: 'exam_pay_test', signature: 'exam_fake_payment' };
  assert.equal(provider.verifyPayment(payment), true);
  assert.equal(provider.verifyPayment({ ...payment, providerOrderId: 'order_real' }), false);
  assert.equal(provider.verifyPayment({ ...payment, signature: 'invalid' }), false);
  assert.equal(provider.verifyWebhookSignature('{}', 'exam_fake_payment'), false);
  await assert.rejects(provider.refundPayment({ providerPaymentId: 'pay_real' }));
  assert.equal((await provider.refundPayment({ providerPaymentId: payment.providerPaymentId })).raw.simulated, true);
});

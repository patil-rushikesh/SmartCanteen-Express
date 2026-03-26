export interface InitiatePaymentInput {
  amountInPaise: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}

export interface InitiatePaymentResult {
  providerOrderId: string;
  amountInPaise: number;
  currency: string;
  receipt: string;
  raw: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface RefundPaymentInput {
  providerPaymentId: string;
  amountInPaise?: number;
  notes?: Record<string, string>;
}

export interface RefundPaymentResult {
  refundId: string;
  raw: Record<string, unknown>;
}

export interface PaymentWebhookEvent {
  eventId?: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  signature?: string;
  method?: string;
  amountInPaise?: number;
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyPayment(input: VerifyPaymentInput): boolean;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  parseWebhook(rawBody: string): PaymentWebhookEvent;
}

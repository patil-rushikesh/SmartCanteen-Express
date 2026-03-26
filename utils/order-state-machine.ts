import { OrderStatus } from '../models/domain.js';
import { AppError } from './errors.js';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'PAYMENT_FAILED', 'CANCELLED'],
  PAID: ['QR_GENERATED'],
  PAYMENT_FAILED: [],
  CANCELLED: [],
  QR_GENERATED: ['CONFIRMED', 'EXPIRED'],
  CONFIRMED: ['PREPARING', 'CANCELLED', 'REFUNDED'],
  PREPARING: ['READY', 'DELAYED'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  EXPIRED: [],
  REFUNDED: [],
  ISSUE_REPORTED: [],
  DELAYED: ['PREPARING', 'READY', 'REFUNDED']
};

export const assertValidTransition = (currentState: OrderStatus, nextState: OrderStatus) => {
  if (!transitions[currentState].includes(nextState)) {
    throw new AppError(409, `Invalid order state transition from ${currentState} to ${nextState}`);
  }
};

export const canTransition = (currentState: OrderStatus, nextState: OrderStatus) =>
  transitions[currentState].includes(nextState);

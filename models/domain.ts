export const RoleCode = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CANTEEN_MANAGER: 'CANTEEN_MANAGER',
  CUSTOMER: 'CUSTOMER'
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const OrderStatus = {
  CREATED: 'CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CANCELLED: 'CANCELLED',
  QR_GENERATED: 'QR_GENERATED',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
  ISSUE_REPORTED: 'ISSUE_REPORTED',
  DELAYED: 'DELAYED'
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED'
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const QRStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
} as const;

export type QRStatus = (typeof QRStatus)[keyof typeof QRStatus];

export const AuditEntityType = {
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  QR_TOKEN: 'QR_TOKEN',
  USER: 'USER',
  COLLEGE: 'COLLEGE',
  MENU_ITEM: 'MENU_ITEM',
  AUTH: 'AUTH'
} as const;

export type AuditEntityType = (typeof AuditEntityType)[keyof typeof AuditEntityType];

export const AuditEventType = {
  STATE_TRANSITION: 'STATE_TRANSITION',
  QR_SCANNED: 'QR_SCANNED',
  QR_GENERATED: 'QR_GENERATED',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_INITIATED: 'REFUND_INITIATED',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  ISSUE_REPORTED: 'ISSUE_REPORTED',
  DELAY_MARKED: 'DELAY_MARKED',
  MANAGER_ASSIGNED: 'MANAGER_ASSIGNED',
  MENU_UPDATED: 'MENU_UPDATED',
  COLLEGE_CREATED: 'COLLEGE_CREATED',
  COLLEGE_UPDATED: 'COLLEGE_UPDATED',
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_REGISTER: 'AUTH_REGISTER',
  REFRESH_TOKEN_ROTATED: 'REFRESH_TOKEN_ROTATED'
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

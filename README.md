# Smart Canteen Backend Summary

## Architecture

This backend uses Express + TypeScript + Prisma with a Clean Architecture inspired structure:

- `controllers/` handles HTTP input/output only.
- `services/` holds application logic and the order/payment/QR lifecycle.
- `repositories/` is the persistence abstraction over Prisma.
- `models/` contains request schemas and shared request typing.
- `interfaces/` defines swappable contracts for payments, storage, and cache.
- `modules/` groups feature routes by use case.
- `middlewares/` centralizes auth, RBAC, tenant resolution, validation, rate limits, and error handling.
- `utils/` contains cross-cutting helpers such as env parsing, JWT, hashing, crypto, and the strict order FSM.
- `lib/container.ts` wires dependencies manually for simple dependency injection.

The backend is stateless, tenant-aware, and horizontal-scaling ready. Redis is used through a cache abstraction for carts and QR/token cache hints, while the design keeps PostgreSQL as the source of truth.

## Folder Structure

```text
controllers/
  adminController/
  authController/
  customerController/
  managerController/
  paymentController/
services/
  admin/
  auth/
  customer/
  manager/
  payments/
  shared/
repositories/
models/
modules/
  admin/
  auth/
  customer/
  manager/
  payment/
middlewares/
utils/
interfaces/
lib/
prisma/
scripts/
index.ts
backend_summary.md
```

## Database Design

Primary tables:

- `colleges`: each row is a tenant.
- `roles`: role catalog with `SUPER_ADMIN`, `CANTEEN_MANAGER`, `CUSTOMER`.
- `users`: tenant users plus platform owner.
- `canteens`: tenant canteens.
- `manager_assignments`: manager-to-canteen mapping.
- `menu_items`: tenant-scoped catalog with price snapshots stored later in order items.
- `orders`: tenant-scoped order aggregate with the full lifecycle state.
- `order_items`: immutable menu snapshot at order creation time.
- `payments`: provider state, idempotency key, webhook data, and refund data.
- `qr_tokens`: signed one-time QR record with expiry and scan metadata.
- `refresh_tokens`: persisted refresh token rotation.
- `audit_logs`: state transitions, QR scans, payment events, refunds, and operational events.

Tenant isolation:

- All tenant-owned business tables carry `tenantId`.
- Controllers resolve tenant context from JWT or `x-tenant-id`.
- Services and repositories always query by tenant.
- Super admin routes are deliberately separate from tenant routes.

Indexes are present on the main tenant/status lookup paths such as orders, menu items, payments, QR tokens, refresh tokens, and audit logs.

## API List

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

Admin:

- `GET /api/admin/colleges`
- `POST /api/admin/colleges`
- `PUT /api/admin/colleges/:id`
- `DELETE /api/admin/colleges/:id`
- `GET /api/admin/colleges/:id/managers`
- `POST /api/admin/managers`
- `GET /api/admin/analytics/overview`

Customer:

- `GET /api/customer/menu`
- `GET /api/customer/cart`
- `PUT /api/customer/cart`
- `DELETE /api/customer/cart`
- `POST /api/customer/orders`
- `GET /api/customer/orders`
- `GET /api/customer/orders/:orderId/qr`
- `POST /api/customer/orders/:orderId/payments/initiate`
- `POST /api/customer/payments/verify`
- `POST /api/customer/orders/:orderId/issues`

Manager:

- `GET /api/manager/menu-items`
- `POST /api/manager/menu-items`
- `PUT /api/manager/menu-items/:menuItemId`
- `DELETE /api/manager/menu-items/:menuItemId`
- `GET /api/manager/orders`
- `POST /api/manager/orders/scan-qr`
- `PATCH /api/manager/orders/:orderId/status`
- `GET /api/manager/payments/report`

Payments:

- `POST /api/payments/webhooks/razorpay`

## Lifecycle Explanation

Order FSM:

- `CREATED -> PAYMENT_PENDING, CANCELLED`
- `PAYMENT_PENDING -> PAID, PAYMENT_FAILED, CANCELLED`
- `PAID -> QR_GENERATED`
- `QR_GENERATED -> CONFIRMED, EXPIRED`
- `CONFIRMED -> PREPARING, CANCELLED, REFUNDED`
- `PREPARING -> READY, DELAYED`
- `READY -> COMPLETED`
- `DELAYED -> PREPARING, READY, REFUNDED`

Important lifecycle rules:

- QR scan does not complete the order.
- QR scan means customer present and order acknowledged.
- Completion only happens when the manager explicitly moves `READY -> COMPLETED`.
- Payment success is handled through Razorpay webhook processing.
- After payment success, the backend generates a signed QR token with `orderId`, `tenantId`, `exp`, and `nonce`.
- QR tokens are one-time use, tenant-bound, and time-limited.
- Delay detection marks stuck `CONFIRMED` or `PREPARING` orders as `DELAYED`.
- Customer complaints move orders to `ISSUE_REPORTED`.
- Refunds use the payment abstraction, update payment state, and record audit events.

Audit logging captures:

- order state transitions
- QR scans
- payment initiation
- payment success/failure
- refunds
- issue reporting
- delay marking

## Setup Steps

1. Install dependencies: `pnpm install`
2. Create `.env` with at least:
   - `DATABASE_URL`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `JWT_QR_SECRET`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
   - `REDIS_URL` (optional but recommended)
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
3. Generate Prisma client: `pnpm prisma:generate`
4. Apply schema: `pnpm prisma:migrate dev` or `pnpm prisma:db:push`
5. Seed sample data: `pnpm seed`
6. Start locally: `pnpm dev`

Seeded credentials:

- Super admin: `owner@smartcanteen.com / SuperAdmin@123`
- Managers: `manager.alpha@smartcanteen.com / Manager@123`, `manager.beta@smartcanteen.com / Manager@123`
- Customers: `student.alpha@smartcanteen.com / Customer@123`, `student.beta@smartcanteen.com / Customer@123`

## Extension Guide

Payment provider swap:

- Implement the `PaymentProvider` interface in `interfaces/payment-provider.ts`.
- Replace the adapter wired in `lib/container.ts`.

Storage provider swap:

- Implement `StorageProvider` from `interfaces/storage-provider.ts`.
- Replace the adapter in `services/shared/storage.service.ts`.

Redis/BullMQ growth path:

- `services/shared/cache.service.ts` already abstracts Redis.
- Add BullMQ workers for QR expiry, delayed-order checks, analytics rollups, or webhook retry handling without changing controller logic.

Multi-canteen growth:

- Managers already map to canteens via `manager_assignments`.
- Menu and order APIs are already canteen-scoped under the same tenant.

Future additions:

- add invoice generation
- add coupon/promotions module
- add tenant-specific tax and business hour rules
- add inventory reservation and stock decrement policies
- add notification workers for order status changes

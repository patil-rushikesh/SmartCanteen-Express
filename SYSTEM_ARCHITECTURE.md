# SmartCanteen System Architecture

## 🏗️ Overview

SmartCanteen is a production-grade, multi-tenant SaaS backend for managing college canteen operations. The system enables customers to order food, managers to fulfill orders, and administrators to manage colleges and users. It features a stateless, horizontally-scalable architecture with clean separation of concerns.

---

## 📊 Architecture Layers

### 1. **Client Layer**
- **Web Browser**: React + Vite + Tailwind CSS frontend
- **Mobile Clients**: REST API consumers
- **E2E Tests**: Playwright-based test suite for automated testing

### 2. **API Gateway & Middleware Stack**
Executes in order:

| Middleware | Purpose |
|-----------|---------|
| **CORS** | Handle cross-origin requests, allow specific origins |
| **Body Parser** | Parse JSON/URL-encoded request bodies (2MB limit) |
| **Rate Limiting** | Prevent abuse with express-rate-limit |
| **Authentication** | JWT token verification and user context extraction |
| **Authorization** | Role-Based Access Control (RBAC) enforcement |
| **Request Validation** | Zod schema validation |
| **Tenant Context** | Multi-tenant isolation and context injection |
| **Error Handler** | Centralized error tracking and response formatting |

### 3. **API Layer (Express Routes)**

```
/api
├── /auth              # Authentication & Authorization
├── /admin             # Super-admin college & manager management
├── /customer          # Customer orders & menu browsing
├── /manager           # Order fulfillment & canteen ops
└── /payments/webhooks # Razorpay webhook handler
```

### 4. **Controller Layer**
- **Role**: HTTP interface layer - only handles request/response mapping
- **Files**: `controllers/{domain}Controller/index.ts`
- **Pattern**: Thin controllers that delegate to services
- **Input**: Validated request objects
- **Output**: Standardized HTTP responses

### 5. **Service Layer (Business Logic)**
- **AuthService**: JWT generation, password hashing with bcryptjs, token refresh
- **AdminService**: College CRUD, manager assignment, role management
- **CustomerService**: Menu browsing, order creation, cart management
- **ManagerService**: Order fulfillment workflow, order status updates
- **PaymentService**: Payment orchestration, webhook handling, refund processing
- **QRService**: QR token generation, expiry management, scan tracking
- **AuditService**: Comprehensive event logging for compliance

### 6. **Repository Layer (Data Abstraction)**
- **UserRepository**: User CRUD and role queries
- **OrderRepository**: Order lifecycle with advanced filtering
- **PaymentRepository**: Payment state management
- **MenuItemRepository**: Menu catalog with stock tracking
- **QRTokenRepository**: QR token lifecycle
- **AuditLogRepository**: Event persistence
- **AnalyticsRepository**: Aggregation queries

All repositories abstract Prisma Client, enabling easy swapping of ORM.

### 7. **External Integration Layer**

| Service | Purpose | Integration |
|---------|---------|-------------|
| **Razorpay** | Payment processing | `RazorpayPaymentProvider` - abstract payment interface |
| **AWS S3** | Image storage & delivery | SDK v3 integration for menu images |
| **Redis** | Caching & sessions | Cart data, QR token caching, session hints |
| **PostgreSQL** | Primary data store | Prisma adapter with connection pooling |

---

## 🗄️ Database Design

### Multi-Tenancy Model
- **Isolation Level**: Row-level isolation via `tenantId` (College)
- **All business tables** carry `tenantId` for strict tenant boundaries
- **Query Pattern**: Every service/repository query filters by tenant

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| **colleges** | Tenant records (SaaS customers) | id, slug, code, contactEmail |
| **roles** | Role catalog | code (SUPER_ADMIN, CANTEEN_MANAGER, CUSTOMER) |
| **users** | Platform users with tenant scoping | tenantId, roleId, email, passwordHash |
| **canteens** | Physical canteen locations | tenantId, name, location, isActive |
| **manager_assignments** | Manager → Canteen mapping | tenantId, managerId, canteenId |
| **menu_items** | Menu catalog with pricing | tenantId, canteenId, priceInPaise, imageUrl |
| **orders** | Order aggregate root | tenantId, customerId, status, totalInPaise |
| **order_items** | Order line items (immutable snapshot) | orderId, menuItemId, unitPrice, quantity |
| **payments** | Payment state & webhook data | tenantId, orderId, provider, providerPaymentId |
| **qr_tokens** | QR fulfillment tokens | tenantId, orderId, tokenHash, expiresAt |
| **refresh_tokens** | Token rotation journal | userId, tokenHash, expiresAt |
| **audit_logs** | Complete event trail | tenantId, entityType, eventType, actor, changes |

### Indexes Strategy
Optimized for common queries:
- `(tenantId, status)` on orders for filtering by state
- `(tenantId, email)` on users for login lookup
- `(tenantId, canteenId, isAvailable)` on menu_items for menu display
- `(tenantId, customerId, createdAt)` on orders for user order history

---

## 🔄 Order Lifecycle (State Machine)

### State Transitions

```
CREATED
  ├─→ PAYMENT_PENDING (Process Payment)
  └─→ CANCELLED (User Cancel)

PAYMENT_PENDING
  ├─→ PAID (Payment Success)
  ├─→ PAYMENT_FAILED (Payment Failed)
  ├─→ CANCELLED (User Cancel)
  └─→ EXPIRED (Timeout)

PAYMENT_FAILED
  ├─→ PAYMENT_PENDING (Retry)
  └─→ CANCELLED

PAID
  ├─→ QR_GENERATED (Generate QR for Fulfillment)
  └─→ ISSUE_REPORTED (Customer Reports Issue)

QR_GENERATED
  ├─→ CONFIRMED (QR Scanned at Canteen)
  └─→ EXPIRED

CONFIRMED
  └─→ PREPARING (Manager Starts Preparation)

PREPARING
  ├─→ DELAYED (Mark Delay)
  └─→ READY (Preparation Complete)

DELAYED
  └─→ READY

READY
  └─→ COMPLETED (Customer Pickup)

ISSUE_REPORTED
  └─→ REFUNDED (Process Refund)
```

### Key Workflow Steps
1. Customer creates order in CREATED state
2. Payment initiated → PAYMENT_PENDING
3. After successful payment → PAID
4. QR token generated → QR_GENERATED
5. Manager scans QR at canteen → CONFIRMED
6. Manager starts prep → PREPARING
7. Preparation done → READY
8. Customer collects → COMPLETED

---

## 🔐 Authentication & Authorization

### Authentication Flow
1. **Registration/Login**: Email + password verification with bcryptjs
2. **JWT Tokens**: 
   - Access Token: Short-lived (15 min default)
   - Refresh Token: Long-lived, persisted in DB for rotation
3. **Token Refresh**: Uses stored refresh token with auto-rotation

### Authorization Layers
- **Role-Based Access Control (RBAC)**: Three roles defined
- **Tenant Context**: Automatic tenant extraction and injection
- **Resource Ownership**: Verify user ownership before access
- **Route Protection**: Middleware chains for endpoint security

### Role Permissions

| Role | Access |
|------|--------|
| **SUPER_ADMIN** | Manage all colleges, users, managers platform-wide |
| **CANTEEN_MANAGER** | Manage assigned canteen, process orders |
| **CUSTOMER** | Browse menu, place orders, track status |

---

## 💳 Payment Processing

### Razorpay Integration
- **Provider**: `RazorpayPaymentProvider` class
- **Flow**: Order → Payment Initiation → Webhook Callback → State Update
- **Idempotency**: Unique `idempotencyKey` prevents duplicate charges
- **Webhook Handling**: Dedicated route at `/api/payments/webhooks`

### Payment States

```
CREATED → PENDING → SUCCESS → [REFUNDED]
              ↓
            FAILED (retryable)
```

### Refund Management
- Full or partial refunds tracked in `Payment.refundedAmountInPaise`
- Audit trail captures all refund events
- Order state transitions to REFUNDED after successful refund

---

## 📦 Dependency Injection & Container

### Manual Service Wiring (`lib/container.ts`)

The project uses manual dependency injection for simplicity:

```typescript
const userRepository = new UserRepository(prisma);
const authService = new AuthService(userRepository, ...);
const authController = new AuthController(authService);

export const container = {
  authService,
  authController,
  // ... all services/controllers
};
```

**Benefits**:
- Explicit dependencies visible in code
- No magic decorator reflections
- Easy testing with mocked dependencies

---

## 🔌 Extensible Interfaces

### Payment Provider Interface
```typescript
interface IPaymentProvider {
  createOrder(amount, currency): Promise<{orderId, amount}>;
  verifySignature(signature, body): boolean;
  refund(paymentId, amount): Promise<RefundResult>;
}
```

Allows swapping Razorpay with Stripe, PayPal, etc.

### Cache Provider Interface
Redis currently used, can be swapped with:
- Memcached
- In-memory cache
- DynamoDB

### Storage Provider Interface
AWS S3 used for images, can swap with:
- Azure Blob Storage
- MinIO

---

## 🚀 Deployment Architecture

### Docker Compose Stack
- **App Container**: Node.js 22-alpine running transpiled TypeScript
- **Frontend Container**: Nginx + React SPA
- **PostgreSQL**: Primary data store with health checks
- **Redis**: Cache and session store

### Build Process
1. **Build Stage**: Install deps, generate Prisma types, compile TypeScript
2. **Runtime Stage**: Minimal Alpine image with only production deps
3. **Cache Optimization**: Layer deps separately for faster builds

### Environment Configuration
Loaded via `.env` file:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection
- `RAZORPAY_KEY_ID/SECRET`: Payment provider credentials
- `S3_BUCKET` and `AWS_REGION`: Image hosting configuration
- `CORS_ORIGIN`: Allowed frontend origins
- `PORT`: Server port (default: 8080)

### Health Monitoring
- Health endpoint: `GET /api/health`
- Returns: `{status, timestamp, environment}`
- Docker compose service health checks enabled

---

## 📊 Data Flow Examples

### Order Creation Flow
```
Customer Request
    ↓
CustomerController.createOrder()
    ↓
CustomerService.createOrder()
    ├─→ Validate cart items against menu
    ├─→ Calculate totals
    ├─→ Create order in CREATED state
    ├─→ Fire audit event
    └─→ Return order with orderId
    ↓
OrderRepository.create(order)
    ↓
PostgreSQL: INSERT INTO orders ...
```

### Payment Webhook Flow
```
Razorpay Webhook
    ↓
PaymentController.handleWebhook()
    ├─→ Verify signature
    ├─→ Validate idempotency key
    └─→ Route to PaymentService
    ↓
PaymentService.handlePaymentEvent()
    ├─→ Update payment record
    ├─→ Transition order to PAID
    ├─→ Log audit event
    └─→ Trigger QR generation
    ↓
QRService.generateQRToken()
    ├─→ Create signed token
    ├─→ Store in PostgreSQL & Redis
    └─→ Return QR data URL
```

### Order Fulfillment Flow
```
Manager Scans QR
    ↓
ManagerService.confirmOrderReceipt()
    ├─→ Verify QR token validity
    ├─→ Validate order state
    ├─→ Update order to CONFIRMED
    ├─→ Fire audit event
    └─→ Response with order details
```

---

## 🔍 Audit & Compliance

### Audit Events Captured
- User authentication (login, registration, refresh)
- Order state transitions
- Payment events (initiated, succeeded, failed, refunded)
- QR token generation and scanning
- Manager assignments
- Menu updates

### Audit Log Schema
- `entityType`: ORDER, PAYMENT, QR_TOKEN, USER, AUTH, etc.
- `eventType`: STATE_TRANSITION, QR_SCANNED, PAYMENT_SUCCEEDED, etc.
- `actor`: User who performed action
- `changes`: JSON of before/after state
- `metadata`: Additional context (IP, user agent, etc.)
- `timestamp`: Precise event timing

---

## 🛡️ Security Measures

### Password Security
- Bcryptjs hashing with salt rounds
- Never stored in plaintext
- Compared during login using bcryptjs

### JWT Security
- Signed with secret key
- Contains claims: userId, roleId, tenantId
- Short expiration (15 min access token)
- Refresh token rotation on each refresh

### CORS Configuration
- Whitelisted origins only
- Credentials support enabled
- Allowed methods: GET, POST, PUT, PATCH, DELETE

### Input Validation
- Zod schema validation on all endpoints
- Type-safe request/response contracts
- Rejects malformed/oversized payloads (>2MB)

### Rate Limiting
- Per-IP request throttling
- Configurable limits per endpoint
- Prevents brute force and DDoS

### Tenant Isolation
- Row-level security via tenantId
- Controllers verify tenant context
- Services/repos always filter by tenant
- Super admin routes separate

---

## 🎯 Key File Locations

```
controllers/
├── adminController/           # Admin endpoints
├── authController/            # Auth endpoints
├── customerController/        # Customer endpoints
├── managerController/         # Manager endpoints
└── paymentController/         # Payment webhooks

services/
├── admin/admin.service.ts     # Admin logic
├── auth/auth.service.ts       # Authentication & JWT
├── customer/
│   └── customer.service.ts    # Order & menu logic
├── manager/
│   └── manager.service.ts     # Fulfillment logic
├── payments/
│   └── payment.service.ts     # Payment orchestration
└── shared/
    ├── audit.service.ts       # Event logging
    └── qr.service.ts          # QR token generation

repositories/
├── index.ts                   # Repository exports
├── user.repository.ts
├── order.repository.ts
├── payment.repository.ts
└── ...

middlewares/
├── authenticate.ts            # JWT verification
├── authorize.ts               # RBAC enforcement
├── error-handler.ts           # Error response formatting
├── rate-limit.ts              # Request throttling
├── tenant-context.ts          # Tenant isolation
└── validate-request.ts        # Zod validation

modules/
├── auth/routes.ts             # Auth route definitions
├── admin/routes.ts            # Admin routes
├── customer/routes.ts         # Customer routes
├── manager/routes.ts          # Manager routes
└── payment/routes.ts          # Payment webhook routes

utils/
├── jwt.ts                     # JWT token utilities
├── password.ts                # Password hashing
├── crypto.ts                  # Cryptographic helpers
├── errors.ts                  # Custom error classes
└── order-state-machine.ts     # State transition logic

prisma/
├── schema.prisma              # Data model definition
└── migrations/                # Database migration history

lib/
├── container.ts               # Dependency injection
├── prisma-client.ts           # Prisma client singleton
└── prisma.ts                  # Prisma initialization
```

---

## 🧪 Testing Strategy

- **E2E Tests**: Playwright for full workflow testing
- **Test Coverage**: App scenarios (registration, ordering, payments)
- **CI/CD Integration**: Automated test runs on push

---

## 🔄 Scalability Considerations

### Horizontal Scaling Ready
- **Stateless API**: No session state in memory
- **External Session Store**: Redis for distributed session management
- **Database Connection Pooling**: Efficient Postgres connection usage
- **Load Balancing**: Any request can go to any server instance

### Performance Optimizations
- **Database Indexing**: Strategic indexes on tenant/status lookups
- **Query Optimization**: Efficient Prisma queries with eager loading
- **Caching Layer**: Redis for frequently accessed data
- **Rate Limiting**: Prevents resource exhaustion

### Future Enhancements
- Message queue (BullMQ ready) for async tasks
- WebSocket support for real-time updates
- Advanced monitoring and distributed tracing
- GraphQL API layer

---

## 📱 API Endpoints Summary

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user profile

### Admin
- `GET /api/admin/colleges` - List colleges
- `POST /api/admin/colleges` - Create college
- `PUT /api/admin/colleges/:id` - Update college
- `DELETE /api/admin/colleges/:id` - Delete college
- `GET /api/admin/colleges/:id/managers` - List managers
- `POST /api/admin/managers` - Create manager
- `GET /api/admin/analytics/overview` - Platform analytics

### Customer
- `GET /api/customer/menu` - Browse menu
- `POST /api/customer/orders` - Create order
- `GET /api/customer/orders` - List user orders
- `GET /api/customer/orders/:id` - Order details
- `DELETE /api/customer/orders/:id` - Cancel order

### Manager
- `GET /api/manager/orders` - Pending orders
- `PATCH /api/manager/orders/:id/confirm` - Confirm order receipt
- `PATCH /api/manager/orders/:id/status` - Update order status
- `GET /api/manager/analytics` - Canteen analytics

### Payment Webhooks
- `POST /api/payments/webhooks` - Razorpay webhook handler

---

## 🚦 Environment Setup

### Required Environment Variables
```env
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://user:password@localhost:5432/smart_canteen
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_key
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
S3_BUCKET=your_asset_bucket
AWS_REGION=ap-south-1
CORS_ORIGIN=http://localhost:5173
```

---

## 📈 Project Statistics

- **Languages**: TypeScript, SQL
- **Framework**: Express.js 5.x
- **Database**: PostgreSQL 16
- **ORM**: Prisma 7.5
- **Cache**: Redis
- **Auth**: JWT + bcryptjs
- **Payments**: Razorpay API
- **Frontend**: React + Vite + Tailwind
- **Package Manager**: pnpm
- **Node Version**: 22-alpine

---

## 🔗 Related Documentation

- [README.md](./README.md) - Project overview
- [Prisma Schema](./prisma/schema.prisma) - Database design
- [Package.json](./package.json) - Dependencies and scripts
- [Docker Compose](./docker-compose.yml) - Deployment configuration

---

**Last Updated**: April 2026  
**Version**: 1.0.0  
**Status**: Production-Ready

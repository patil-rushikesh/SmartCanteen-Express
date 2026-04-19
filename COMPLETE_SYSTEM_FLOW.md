# SmartCanteen Complete System Flow: Super Admin → Order Success/Failure

## 📋 Overview
This document details the complete implemented flow in SmartCanteen from Super Admin setup through customer order processing, including success and failure scenarios.

---

## 🔐 Phase 1: Super Admin Setup & Initialization

### 1.1 Super Admin Access
**Endpoint**: `/api/admin/colleges`
**Authentication**: JWT Token (SUPER_ADMIN role)
**Middleware Chain**:
1. CORS Check
2. Body Parser (2MB limit)
3. Rate Limiting
4. Authentication (JWT verification)
5. Authorization (SUPER_ADMIN role check)
6. Error Handler

### 1.2 Create College/Tenant
**Flow**:
```
POST /api/admin/colleges
├─ Input Validation (Zod Schema)
│  ├─ name (string)
│  ├─ code (unique)
│  ├─ contactEmail
│  ├─ defaultCanteenName
│  └─ contactPhone, address (optional)
│
└─ AdminService.createCollege()
   ├─ Create College record
   │  ├─ Generate slug from name
   │  ├─ Store contact info
   │  └─ Set isActive = true
   │
   ├─ Create default Canteen
   │  └─ Link to college (tenantId = college.id)
   │
   └─ Audit Log
      ├─ Event: COLLEGE_CREATED
      ├─ Entity: COLLEGE
      └─ Metadata: canteenId
```

**Database State After**:
```
colleges table:
  id: uuid
  name, slug, code (unique)
  contactEmail, contactPhone, address
  isActive: true
  
canteens table:
  id: uuid
  tenantId: college.id (multi-tenancy key)
  name: defaultCanteenName
  isActive: true
```

### 1.3 Assign Canteen Manager
**Endpoint**: `POST /api/admin/managers`
**Flow**:
```
POST /api/admin/managers
├─ Input Validation
│  ├─ tenantId (college ID)
│  ├─ canteenId
│  ├─ email (unique)
│  ├─ password
│  ├─ fullName
│  └─ phone
│
└─ AdminService.assignManager()
   ├─ Verify college exists & isActive
   ├─ Verify canteen exists in college
   ├─ Check email not already registered
   ├─ Get CANTEEN_MANAGER role
   │
   ├─ Create User (Manager)
   │  ├─ Hash password (bcryptjs)
   │  ├─ Store in users table
   │  ├─ Set roleId = CANTEEN_MANAGER
   │  └─ Set tenantId = college.id
   │
   ├─ Create ManagerAssignment
   │  └─ Link manager → canteen (with tenantId)
   │
   └─ Audit Log: MANAGER_ASSIGNED
```

**Database State After**:
```
users table:
  id: uuid
  email: unique
  passwordHash: bcrypt hash
  fullName, phone
  roleId: CANTEEN_MANAGER role id
  tenantId: college.id

manager_assignments table:
  id: uuid
  tenantId: college.id
  managerId: user.id
  canteenId: canteen.id
```

### 1.4 View Platform Analytics
**Endpoint**: `GET /api/admin/analytics/overview`
**Returns**:
- activeTenants (distinct colleges)
- totalCustomers (count of CUSTOMER role users)
- totalManagers (count of CANTEEN_MANAGER role users)
- totalOrders (all orders across tenants)
- grossMerchandiseValueInPaise (sum of order totals)
- ordersByStatus (breakdown by order status)
- paidPayments (count of SUCCESS payments)

---

## 👥 Phase 2: Customer Registration & Authentication

### 2.1 List Available Tenants
**Endpoint**: `GET /api/auth/tenants`
**No Authentication Required**
```
Response:
[
  {
    id: college.id,
    name: college.name,
    slug: college.slug,
    code: college.code,
    isActive: true
  },
  ...
]
```

### 2.2 Customer Registration
**Endpoint**: `POST /api/auth/register`
**Rate Limited** (express-rate-limit by IP)

```
POST /api/auth/register
├─ Input Validation (Zod)
│  ├─ email (format: email)
│  ├─ password (min 8 chars, special chars)
│  ├─ fullName
│  ├─ phone
│  ├─ collegeId (tenant selection)
│  ├─ studentFacultyId (optional)
│  └─ yearOfStudy (optional)
│
└─ AuthService.register()
   ├─ Verify college exists & isActive
   ├─ Check email not already in use (globally unique)
   ├─ Get CUSTOMER role
   │
   ├─ Create User
   │  ├─ Hash password (bcryptjs)
   │  ├─ Store in users table
   │  └─ Set tenantId = college.id
   │
   ├─ Generate Tokens
   │  ├─ Create Access Token (JWT, 15 min expiry default)
   │  │  └─ Payload: { userId, email, role, tenantId }
   │  └─ Create & Store Refresh Token
   │     ├─ Generate random token
   │     ├─ Hash it (bcryptjs)
   │     ├─ Store in refresh_tokens table
   │     └─ Set expiry: 7 days
   │
   └─ Audit Log: AUTH_REGISTER
```

**Response**:
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "refresh_...",
  "user": {
    "id": "user-id",
    "email": "student@college.edu",
    "fullName": "John Doe",
    "role": "CUSTOMER",
    "college": { "id": "college-id", "name": "..." }
  }
}
```

**Database State After**:
```
users table:
  id: uuid
  email: unique globally
  passwordHash: bcrypt
  fullName, phone
  studentFacultyId, yearOfStudy
  tenantId: college.id
  roleId: CUSTOMER role id
  isActive: true

refresh_tokens table:
  id: uuid
  userId: user.id
  tokenHash: bcrypt hash
  expiresAt: now + 7 days
```

### 2.3 Customer Login
**Endpoint**: `POST /api/auth/login`
**Rate Limited**

```
POST /api/auth/login
├─ Input: { email, password }
│
├─ AuthService.login()
│  ├─ Find user by email
│  ├─ Verify password hash
│  │
│  ├─ Generate Access Token (15 min)
│  │  └─ Payload: { userId, email, role, tenantId }
│  │
│  ├─ Invalidate old refresh tokens
│  │
│  ├─ Create new Refresh Token
│  │  ├─ Generate token
│  │  ├─ Hash and store
│  │  └─ 7 day expiry
│  │
│  └─ Audit Log: AUTH_LOGIN
│
└─ Return: accessToken, refreshToken, user
```

### 2.4 Token Refresh (Auto-rotation)
**Endpoint**: `POST /api/auth/refresh`

```
POST /api/auth/refresh
├─ Input: { refreshToken }
│
├─ AuthService.refreshTokens()
│  ├─ Lookup stored refresh token
│  ├─ Verify hash matches
│  ├─ Check not expired
│  │
│  ├─ Invalidate old refresh token
│  │
│  ├─ Generate NEW Access Token (15 min)
│  ├─ Generate NEW Refresh Token (7 days)
│  │  ├─ Hash and store new token
│  │  └─ Remove old token from DB
│  │
│  ├─ Audit Log: REFRESH_TOKEN_ROTATED
│  │
│  └─ Return: new accessToken, new refreshToken
```

---

## 🛒 Phase 3: Customer Browse & Create Order

### 3.1 Browse Menu
**Endpoint**: `GET /api/customer/menu`
**Authentication**: CUSTOMER JWT
**Query Params** (optional):
- `canteenId`: Filter by specific canteen

```
GET /api/customer/menu?canteenId=canteen-123
├─ Middleware Chain
│  ├─ Authentication: Verify JWT
│  ├─ Authorization: CUSTOMER role check
│  ├─ Tenant Context Resolution
│  │  └─ Extract tenantId from user.tenantId
│  └─ Tenant Context Required
│
├─ CustomerService.listMenu(tenantId, canteenId)
│  └─ MenuItemRepository.list()
│     ├─ Query: WHERE tenantId = ? AND isAvailable = true
│     └─ Optional: AND canteenId = ?
│
└─ Return: [MenuItem, ...]
   ├─ id, name, description, category
   ├─ priceInPaise
   ├─ imageUrl (from S3)
   └─ stockQuantity, isAvailable
```

### 3.2 Manage Shopping Cart
**Cart Storage**: Redis (24 hour TTL)
**Format**: Array of { menuItemId, quantity }

#### Add/Update Cart
```
PUT /api/customer/cart
├─ Input: { items: [{ menuItemId, quantity }, ...] }
│
├─ Middleware: Tenant Context check
│
├─ Authentication validation
│  └─ Extract customerId from JWT
│
├─ CustomerService.setCart()
│  ├─ Validate all menuItems exist in tenantId
│  ├─ Verify items are available
│  │
│  └─ cacheProvider.set()
│     ├─ Key: `cart:{tenantId}:{customerId}`
│     ├─ Value: serialized items
│     └─ TTL: 24 hours
│
└─ Response: { items: [...] }
```

#### Get Cart
```
GET /api/customer/cart
├─ Authentication: CUSTOMER
├─ Tenant Context extractio
│
├─ CustomerService.getCart()
│  └─ cacheProvider.get(`cart:{tenantId}:{customerId}`)
│
└─ Response: [{ menuItemId, quantity }, ...]
```

#### Clear Cart
```
DELETE /api/customer/cart
├─ Authentication: CUSTOMER
├─ Tenant Context
│
├─ CustomerService.clearCart()
│  └─ cacheProvider.del(`cart:{tenantId}:{customerId}`)
│
└─ Response: { cleared: true }
```

### 3.3 Create Order
**Endpoint**: `POST /api/customer/orders`
**Authentication**: CUSTOMER JWT

```
POST /api/customer/orders
├─ Input Validation
│  ├─ canteenId (required)
│  └─ items: [{ menuItemId, quantity }, ...] (required)
│
├─ Middleware
│  ├─ Authentication (get customerId)
│  ├─ Authorization (CUSTOMER role)
│  ├─ Tenant Context (get tenantId)
│  └─ Validate request
│
├─ CustomerService.createOrder()
│  │
│  ├─ Validate items array not empty
│  │
│  ├─ Fetch all menu items
│  │  ├─ Check in tenantId
│  │  ├─ Verify all exist
│  │  └─ Verify item count matches
│  │
│  ├─ For each item:
│  │  ├─ Verify isAvailable = true
│  │  ├─ Verify canteenId matches
│  │  └─ Create OrderItem snapshot
│  │     ├─ Store: menuItemId, name, imageUrl
│  │     ├─ Store: unitPrice, quantity, totalPrice
│  │     └─ Mark as immutable snapshot
│  │
│  ├─ Calculate totals
│  │  └─ subtotalInPaise = sum(item.totalPrice)
│  │     totalInPaise = subtotalInPaise (no tax/fees yet)
│  │
│  ├─ Create Order record
│  │  ├─ status: "CREATED"
│  │  ├─ tenantId, customerId, canteenId
│  │  ├─ subtotalInPaise, totalInPaise
│  │  ├─ currency: "INR"
│  │  └─ createdAt: now
│  │
│  ├─ Create OrderItems (linked to Order)
│  │  └─ Bulk insert all items
│  │
│  ├─ Clear customer's cart
│  │  └─ cacheProvider.del(`cart:{tenantId}:{customerId}`)
│  │
│  └─ Audit Log (optional - can add if needed)
│
└─ Response: {
     id: order.id,
     status: "CREATED",
     totalInPaise: xxx,
     items: [OrderItem, ...],
     createdAt
   }
```

**Database State After Order Creation**:
```
orders table:
  id: uuid (PRIMARY)
  tenantId: college.id
  canteenId: canteen.id
  customerId: user.id
  status: "CREATED"
  totalInPaise: number
  currency: "INR"
  paymentInitiatedAt: null
  paidAt: null
  qrGeneratedAt: null
  expiresAt: null
  completedAt: null
  issueReason: null
  createdAt, updatedAt

order_items table (immutable snapshot):
  id: uuid
  orderId: order.id
  tenantId: university.id
  menuItemId: menuItem.id
  menuItemName, imageUrl (snapshot)
  unitPriceInPaise, quantity, totalPriceInPaise
```

---

## 💳 Phase 4: Payment Initiation & Processing

### 4.1 Initiate Payment
**Endpoint**: `POST /api/customer/orders/{orderId}/payments/initiate`
**Authentication**: CUSTOMER JWT

```
POST /api/customer/orders/order-123/payments/initiate
├─ Input: {
│    idempotencyKey: "unique-key-per-customer"
│  }
│
├─ Middleware: Auth, Tenant Context
│
├─ PaymentService.initiateOrderPayment()
│  │
│  ├─ Fetch order
│  │  ├─ Verify belongs to customer
│  │  ├─ Verify in correct tenantId
│  │  └─ Check status in [CREATED, PAYMENT_FAILED]
│  │
│  ├─ Idempotency Check (critical)
│  │  └─ Look up: payment with same idempotencyKey
│  │     └─ If exists → return existing payment
│  │
│  ├─ Check existing payment for order
│  │  └─ If status in [PENDING, SUCCESS] → reuse it
│  │
│  ├─ Call RazorpayPaymentProvider.initiatePayment()
│  │  │
│  │  ├─ Razorpay API Call
│  │  │  ├─ Method: POST /orders
│  │  │  ├─ Payload:
│  │  │  │  ├─ amount: order.totalInPaise
│  │  │  │  ├─ currency: "INR"
│  │  │  │  ├─ receipt: `ord_{order.id.slice(0,32)}`
│  │  │  │  └─ notes:
│  │  │  │     ├─ orderId
│  │  │  │     ├─ tenantId
│  │  │  │     └─ customerId
│  │  │  │
│  │  │  └─ Response: {
│  │  │     id: "order_...", (providerOrderId)
│  │  │     receipt, amount, currency,
│  │  │     status: "created", ...
│  │  │  }
│  │  │
│  │  └─ Store raw Razorpay response
│  │
│  ├─ Update Order Status: CREATED → PAYMENT_PENDING
│  │  ├─ Set paymentInitiatedAt = now
│  │  └─ Audit: recordOrderTransition()
│  │
│  ├─ Create/Update Payment record
│  │  ├─ Status: PENDING
│  │  ├─ provider: "RAZORPAY"
│  │  ├─ providerOrderId: razorpay order id
│  │  ├─ amountInPaise, currency
│  │  ├─ idempotencyKey (for idempotency)
│  │  ├─ gatewayResponse: raw Razorpay response
│  │  └─ Link: order.id, tenantId
│  │
│  └─ Audit Events:
│     ├─ PAYMENT_INITIATED
│     ├─ STATE_TRANSITION (CREATED → PAYMENT_PENDING)
│     └─ Include: providerOrderId, idempotencyKey
│
└─ Response: {
     id: payment.id,
     orderId, tenantId,
     status: "PENDING",
     amountInPaise, currency,
     providerOrderId,
     provider: "RAZORPAY"
   }
```

**Database State After Payment Initiation**:
```
orders table (UPDATED):
  status: "PAYMENT_PENDING"
  paymentInitiatedAt: now

payments table (NEW):
  id: uuid
  orderId: order.id
  tenantId: college.id
  provider: "RAZORPAY"
  status: "PENDING"
  providerOrderId: "order_XXXXX"
  amountInPaise, currency
  idempotencyKey: unique
  gatewayResponse: raw JSON
```

---

## ✅ Phase 5: Payment Processing & Success Path

### 5.1 Two Payment Verification Methods

#### Method A: Customer Verifies Payment (Common Flow)
**Endpoint**: `POST /api/customer/payments/verify`

```
POST /api/customer/payments/verify
├─ Input: {
│    providerOrderId: "order_XXXXX",
│    providerPaymentId: "pay_XXXXX",
│    signature: "payment_signature_from_razorpay"
│  }
│
├─ Middleware: Auth, Tenant Context
│
├─ PaymentService.confirmPayment()
│  │
│  ├─ Step 1: Verify Payment Signature
│  │  ├─ RazorpayPaymentProvider.verifyPayment()
│  │  │  ├─ Construct data: orderid|paymentid
│  │  │  ├─ HMAC-SHA256 with Razorpay secret
│  │  │  ├─ Compare with provided signature
│  │  │  └─ Throw error if mismatch (fraud attempt)
│  │  │
│  │  └─ Response: { verified: true }
│  │
│  ├─ Step 2: Find Payment Record
│  │  ├─ Query: payment WHERE providerOrderId = ?
│  │  └─ Verify belongs to customer's order
│  │
│  ├─ Step 3: Update Payment Status
│  │  ├─ IF status != SUCCESS:
│  │  │  ├─ Update status to SUCCESS
│  │  │  ├─ Store providerPaymentId
│  │  │  ├─ Set method: "razorpay_direct"
│  │  │  │
│  │  │  ├─ Step 3a: Order State Transition
│  │  │  │  ├─ IF order.status == PAYMENT_PENDING:
│  │  │  │  │  ├─ assertValidTransition(PAYMENT_PENDING, PAID)
│  │  │  │  │  ├─ Update order.status = PAID
│  │  │  │  │  ├─ Set paidAt = now
│  │  │  │  │  └─ Audit: recordOrderTransition()
│  │  │  │  │
│  │  │  │  └─ Step 3b: Generate QR Token
│  │  │  │     ├─ QrService.generateForPaidOrder()
│  │  │  │     │  ├─ Create QRToken record
│  │  │  │     │  ├─ Generate random token
│  │  │  │     │  ├─ Hash token (bcryptjs)
│  │  │  │     │  ├─ Status: ACTIVE
│  │  │  │     │  ├─ expiresAt: now + QR_EXPIRY_MINUTES
│  │  │  │     │  └─ Store in qr_tokens table
│  │  │  │     │
│  │  │  │     └─ Update order.status = QR_GENERATED
│  │  │  │        ├─ expiresAt: qrToken.expiresAt
│  │  │  │        ├─ qrGeneratedAt: now
│  │  │  │        └─ Audit: recordOrderTransition()
│  │  │  │
│  │  │  └─ Audit Event: PAYMENT_SUCCEEDED
│  │  │     └─ Method: customer_verification
│  │  │
│  │  └─ ELSE (already SUCCESS): skip above
│  │
│  └─ Step 4: Return Updated Data
│     ├─ Updated payment record
│     └─ Updated order record (now QR_GENERATED)
│
└─ Response: {
     payment: { id, status: "SUCCESS", ... },
     order: {
       id, status: "QR_GENERATED",
       qrToken: { token, expiresAt, ... },
       ...
     }
   }
```

#### Method B: Razorpay Webhook Notification (Async)
**Endpoint**: `POST /api/payments/webhooks/razorpay`
**Signature Verification**: Required
**Middleware**: Raw body parser (for signature verification)

```
POST /api/payments/webhooks/razorpay
├─ Webhook Event from Razorpay
│  ├─ Event Type: "order.paid" or "payment.captured"
│  ├─ Payload: { event, created_at, contains, ... }
│  └─ Header: x-razorpay-signature
│
├─ PaymentService.handleWebhook()
│  │
│  ├─ Step 1: Verify Webhook Signature
│  │  ├─ Get raw body from request
│  │  ├─ RazorpayPaymentProvider.verifyWebhookSignature()
│  │  │  ├─ HMAC-SHA256(rawBody, secret)
│  │  │  ├─ Compare with x-razorpay-signature
│  │  │  └─ Throw if invalid (reject webhook)
│  │  │
│  │  └─ Response: verified = true
│  │
│  ├─ Step 2: Parse Webhook Event
│  │  ├─ RazorpayPaymentProvider.parseWebhook()
│  │  │  ├─ Extract event type
│  │  │  ├─ Extract providerOrderId
│  │  │  ├─ Extract providerPaymentId
│  │  │  ├─ Extract amountInPaise
│  │  │  ├─ Extract method (card, upi, etc.)
│  │  │  └─ Store full payload for audit
│  │  │
│  │  └─ Validate providerOrderId exists
│  │
│  ├─ Step 3: Find Payment Record
│  │  ├─ Query: payment WHERE providerOrderId = ?
│  │  └─ Throw if not found
│  │
│  ├─ Step 4: Handle Success Events
│  │  ├─ IF event in ["payment.captured", "order.paid"]:
│  │  │  │
│  │  │  ├─ IF payment.status != SUCCESS:
│  │  │  │  │
│  │  │  │  ├─ Update Payment
│  │  │  │  │  ├─ status: SUCCESS
│  │  │  │  │  ├─ providerPaymentId, method
│  │  │  │  │  ├─ webhookEventId: event.id
│  │  │  │  │  ├─ amountInPaise from event
│  │  │  │  │  └─ gatewayResponse: full payload
│  │  │  │  │
│  │  │  │  ├─ IF payment.order.status == PAYMENT_PENDING:
│  │  │  │  │  │
│  │  │  │  │  ├─ Update Order Status: PAYMENT_PENDING → PAID
│  │  │  │  │  │  ├─ paidAt: now
│  │  │  │  │  │  └─ Audit: recordOrderTransition()
│  │  │  │  │  │
│  │  │  │  │  └─ Generate QR (same as Method A)
│  │  │  │  │     ├─ QrService.generateForPaidOrder()
│  │  │  │  │     ├─ Update Order: PAID → QR_GENERATED
│  │  │  │  │     ├─ expiresAt, qrGeneratedAt
│  │  │  │  │     └─ Audit: recordOrderTransition()
│  │  │  │  │
│  │  │  │  └─ Audit Event: PAYMENT_SUCCEEDED
│  │  │  │     └─ Source: webhook
│  │  │  │
│  │  │  └─ Return: { processed: true, status: "success" }
│  │  │
│  │  └─ ELSE: idempotent - already processed this webhook
│  │
│  └─ Step 5: Handle Failure Events
│     └─ IF event in ["payment.failed"]: (see Phase 6)
│
└─ Response: { success: true, data: { processed: true, status: "success" } }
```

**Database State After Successful Payment**:
```
payments table (UPDATED):
  status: "SUCCESS"
  providerPaymentId: "pay_XXXXX"
  method: "card" | "upi" | etc
  webhookEventId: "evt_XXXXX"

orders table (UPDATED):
  status: "QR_GENERATED"
  paidAt: now
  qrGeneratedAt: now
  expiresAt: now + QR_EXPIRY_MINUTES

qr_tokens table (NEW):
  id: uuid
  orderId: order.id
  tenantId: college.id
  tokenHash: bcrypt hash
  status: "ACTIVE"
  expiresAt: now + 15 min (configurable)
  createdAt

audit_logs table (MULTIPLE ENTRIES):
  [1] EVENT: PAYMENT_INITIATED
  [2] STATE_TRANSITION: CREATED → PAYMENT_PENDING
  [3] PAYMENT_SUCCEEDED / STATE_TRANSITION: PAYMENT_PENDING → PAID
  [4] QR_GENERATED / STATE_TRANSITION: PAID → QR_GENERATED
```

---

## ❌ Phase 6: Payment Failure Path

### 6.1 Payment Failure Scenarios

#### Scenario A: Webhook Failure Event
```
Razorpay Webhook: event.type = "payment.failed"
│
├─ PaymentService.handleWebhook()
│  │
│  ├─ FAILURE PATH ONLY:
│  │  ├─ IF event in ["payment.failed"]:
│  │  │  │
│  │  │  ├─ Update Payment Record
│  │  │  │  ├─ status: FAILED
│  │  │  │  ├─ providerPaymentId, method
│  │  │  │  ├─ webhookEventId: event.id
│  │  │  │  └─ gatewayResponse: failure payload
│  │  │  │
│  │  │  ├─ IF payment.order.status == PAYMENT_PENDING:
│  │  │  │  │
│  │  │  │  ├─ Update Order Status: PAYMENT_PENDING → PAYMENT_FAILED
│  │  │  │  │  └─ Audit: recordOrderTransition()
│  │  │  │  │
│  │  │  │  └─ NOTE: Order stays in PAYMENT_FAILED
│  │  │  │     (customer can retry payment)
│  │  │  │
│  │  │  ├─ Audit Event: PAYMENT_FAILED
│  │  │  │  └─ Include failure reason from Razorpay
│  │  │  │
│  │  │  └─ Return: { processed: true, status: "failure" }
│  │  │
│  │  └─ NO QR generated
│  │  └─ NO further order processing
│
│
└─ End: Order remains in PAYMENT_FAILED state
```

#### Scenario B: Customer Explicit Failure (Declined Payment)
```
Customer closes payment gateway without completing
│
├─ Order remains: status = PAYMENT_PENDING
│
├─ Customer must retry:
│  ├─ Call POST /api/customer/orders/{orderId}/payments/initiate
│  │  (same endpoint, new idempotencyKey)
│  └─ Verify Payment again
│
└─ Flow loops back to Phase 5
```

### 6.2 Retry Payment After Failure
```
POST /api/customer/orders/order-123/payments/initiate
├─ Input: { idempotencyKey: "NEW_KEY_FOR_RETRY" }
│
├─ Check: order.status = PAYMENT_FAILED ✓
│  (allowed state for retry)
│
├─ Call Razorpay with NEW order
│  (old order id expired in Razorpay)
│
├─ Update Order: PAYMENT_FAILED → PAYMENT_PENDING
│
├─ Create NEW Payment record
│  └─ status: PENDING
│
└─ Customer verifies payment again (Phase 5)
```

**Database State After Failed Payment**:
```
payments table:
  id: uuid
  status: "FAILED"
  providerPaymentId: "pay_XXXXX"
  method: "card" | null (may not be recorded)
  webhookEventId: "evt_XXXXX"
  gatewayResponse: Razorpay error details

orders table:
  status: "PAYMENT_FAILED"
  paymentInitiatedAt: timestamp
  paidAt: null
  
qr_tokens table: (EMPTY - no QR generated)

audit_logs table:
  [1] PAYMENT_INITIATED
  [2] STATE_TRANSITION: CREATED → PAYMENT_PENDING
  [3] PAYMENT_FAILED / STATE_TRANSITION: PAYMENT_PENDING → PAYMENT_FAILED
```

---

## 🎫 Phase 7: Order Fulfillment (Successful Payment Path)

### 7.1 Customer Retrieves QR Token
**Endpoint**: `GET /api/customer/orders/{orderId}/qr`
**Authentication**: CUSTOMER JWT

```
GET /api/customer/orders/order-123/qr
├─ Middleware: Auth, Tenant Context, Authorization
│
├─ Validation
│  ├─ Verify order belongs to customer
│  ├─ Verify order in correct tenant
│  └─ Verify order.status = QR_GENERATED
│
├─ CustomerService.getQrForOrder()
│  └─ Return qr_token associated with order
│
└─ Response: {
     id: qrToken.id,
     token: qrToken.token (pre-signed),
     expiresAt: qrToken.expiresAt,
     status: "ACTIVE"
   }
```

### 7.2 Manager Views Orders
**Endpoint**: `GET /api/manager/orders`
**Authentication**: CANTEEN_MANAGER JWT
**Query Params** (optional):
- `status`: Filter by order status

```
GET /api/manager/orders?status=QR_GENERATED
├─ Middleware: Auth (CANTEEN_MANAGER), Tenant Context
│
├─ ManagerService.listOrders()
│  │
│  ├─ Get manager's assigned canteens
│  │  └─ Query: manager_assignments WHERE managerId = ? AND tenantId = ?
│  │
│  ├─ SYNC operation: Check for expired orders
│  │  ├─ Find orders WHERE expiresAt <= now
│  │  ├─ For each: QrService.expireQr()
│  │  │  ├─ Update order.status: QR_GENERATED → EXPIRED
│  │  │  └─ Update qr_token.status: ACTIVE → EXPIRED
│  │  │
│  │  └─ Check for overdue orders
│  │     ├─ Find orders WHERE
│  │     │  - status in [CONFIRMED, PREPARING]
│  │     │  - createdAt < (now - ORDER_DELAY_MINUTES)
│  │     │
│  │     └─ For each:
│  │        ├─ Update status: CONFIRMED/PREPARING → DELAYED
│  │        ├─ Set delayMarkedAt: now
│  │        └─ Audit: DELAY_MARKED event
│  │
│  ├─ Query Orders
│  │  └─ WHERE tenantId = ? AND canteenId IN [...] AND status = ?
│  │
│  └─ Return: [Order, ...]
│     ├─ order.id, canteenId, customerId
│     ├─ status, totalInPaise, createdAt
│     └─ order_items with snapshot prices
│
└─ Response: [
     {
       id, status, totalInPaise, customer,
       items: [OrderItem, ...],
       createdAt
     },
     ...
   ]
```

### 7.3 Manager Scans QR Token
**Endpoint**: `POST /api/manager/orders/scan-qr`
**Authentication**: CANTEEN_MANAGER JWT

```
POST /api/manager/orders/scan-qr
├─ Input: { signedToken: "qr_token_from_customer" }
│
├─ Middleware: Auth, Tenant Context
│
├─ ManagerService.scanQr()
│  └─ QrService.validateAndConsume()
│     │
│     ├─ Step 1: Decrypt & Validate Token
│     │  ├─ Parse signed token (JWT-like format)
│     │  ├─ Extract orderId, expiresAt
│     │  ├─ Verify signature (HMAC)
│     │  └─ Check not expired
│     │
│     ├─ Step 2: Find QR Token Record
│     │  ├─ Query: qr_tokens WHERE tokenHash = ?
│     │  └─ Verify status = ACTIVE
│     │
│     ├─ Step 3: Verify Manager Access
│     │  ├─ Get order by orderId
│     │  ├─ Get manager's canteens
│     │  ├─ Check order.canteenId in assigned canteens
│     │  └─ Throw if no access
│     │
│     ├─ Step 4: Consume QR Token
│     │  ├─ Update qr_token
│     │  │  ├─ status: ACTIVE → USED
│     │  │  ├─ scannedAt: now
│     │  │  ├─ scannedByUserId: manager.id
│     │  │  └─ Store in DB
│     │  │
│     │  ├─ Update Order
│     │  │  ├─ status: QR_GENERATED → CONFIRMED
│     │  │  └─ confirmedAt: now
│     │  │
│     │  ├─ Audit Events
│     │  │  ├─ QR_SCANNED: { managerId, timestamp }
│     │  │  └─ STATE_TRANSITION: QR_GENERATED → CONFIRMED
│     │  │
│     │  └─ Return: order (now CONFIRMED)
│     │
│     └─ Response: {
          order: {
            id, status: "CONFIRMED", totalInPaise,
            items: [...],
            ...
          },
          qrToken: { status: "USED", ... }
        }
```

**Database State After QR Scan**:
```
qr_tokens table (UPDATED):
  status: "USED"
  scannedAt: now
  scannedByUserId: manager.id

orders table (UPDATED):
  status: "CONFIRMED"
  confirmedAt: now

audit_logs table (NEW ENTRIES):
  [1] QR_SCANNED event
  [2] STATE_TRANSITION: QR_GENERATED → CONFIRMED
```

### 7.4 Manager Transitions Order Through Preparation
**Endpoint**: `PATCH /api/manager/orders/{orderId}/status`
**Authentication**: CANTEEN_MANAGER JWT

```
PATCH /api/manager/orders/order-123/status
├─ Input: {
│    nextStatus: "PREPARING", // or "READY", "COMPLETED", etc
│    reason: "Started food preparation" (optional)
│  }
│
├─ Middleware: Auth, Tenant Context
│
├─ ManagerService.updateOrderStatus()
│  │
│  ├─ Step 1: Fetch Order
│  │  ├─ Verify exists in tenant
│  │  └─ Verify manager has access to canteen
│  │
│  ├─ Step 2: Validate State Transition
│  │  ├─ assertValidTransition(order.status, nextStatus)
│  │  │
│  │  └─ Allowed transitions per Order State Machine:
│  │     ├─ CONFIRMED → PREPARING, CANCELLED, REFUNDED
│  │     ├─ PREPARING → READY, DELAYED
│  │     ├─ READY → COMPLETED
│  │     ├─ DELAYED → PREPARING, READY, REFUNDED
│  │     └─ (see order-state-machine.ts for full rules)
│  │
│  ├─ Step 3: Handle Special Cases
│  │  │
│  │  ├─ IF nextStatus = REFUNDED:
│  │  │  └─ PaymentService.refundOrder()
│  │  │     (see Phase 8 for refund details)
│  │  │
│  │  └─ ELSE: Regular status update
│  │
│  ├─ Step 4: Update Order
│  │  ├─ status: order.status → nextStatus
│  │  ├─ If nextStatus = COMPLETED:
│  │  │  └─ Set completedAt: now
│  │  ├─ Store changes in DB
│  │  └─ Return updated order
│  │
│  └─ Audit Log
│     ├─ EVENT: STATE_TRANSITION
│     ├─ FROM: order.status
│     ├─ TO: nextStatus
│     ├─ ACTOR: manager.id
│     ├─ REASON: provided reason (optional)
│     └─ TIMESTAMP: now
│
└─ Response: {
     id, status: nextStatus,
     totalInPaise, items: [...],
     ...
   }
```

**State Transitions Path**:
```
CONFIRMED
  ↓ (manager starts prep)
PREPARING
  ├─ (if taking too long)
  ↓
DELAYED
  ├─ (resume preparation)
  ↓
READY
  │ OR continue from PREPARING if not delayed
  ↓
READY
  ↓ (customer picks up)
COMPLETED
  ↓
[FINAL STATE - order finished]
```

---

## 🔄 Phase 8: Issue Reporting & Refunds

### 8.1 Customer Reports Issue
**Endpoint**: `POST /api/customer/orders/{orderId}/issues`
**Authentication**: CUSTOMER JWT

```
POST /api/customer/orders/order-123/issues
├─ Input: { reason: "Item was cold / Missing items / Wrong order" }
│
├─ Middleware: Auth, Tenant Context, Authorization
│
├─ CustomerService.reportIssue()
│  │
│  ├─ Step 1: Find Order
│  │  ├─ Verify belongs to customer
│  │  └─ Verify in tenant
│  │
│  ├─ Step 2: Validate State
│  │  ├─ Only reportable in states:
│  │  │  ├─ CONFIRMED
│  │  │  ├─ PREPARING
│  │  │  ├─ READY
│  │  │  ├─ COMPLETED
│  │  │  └─ DELAYED
│  │  │
│  │  └─ Throw error if not in reportable state
│  │
│  ├─ Step 3: Update Order
│  │  ├─ status: (current) → ISSUE_REPORTED
│  │  ├─ issueReason: provided reason
│  │  └─ Store in DB
│  │
│  └─ Audit Event
│     ├─ EVENT: ISSUE_REPORTED
│     ├─ ENTITY: ORDER
│     ├─ REASON: customer reason
│     └─ ACTOR: customer.id
│
└─ Response: {
     id, status: "ISSUE_REPORTED",
     issueReason, ...
   }
```

**Database State After Issue Report**:
```
orders table (UPDATED):
  status: "ISSUE_REPORTED"
  issueReason: customer's reason

audit_logs table (NEW):
  EVENT: ISSUE_REPORTED
  Timestamp, customer info, reason
```

### 8.2 Refund Process

#### Initiated by Manager
```
PATCH /api/manager/orders/order-123/status
├─ Input: { nextStatus: "REFUNDED", reason: "Customer reported issue" }
│
└─ PaymentService.refundOrder()
   (see below)
```

#### Initiated by Issue Report (Automatic)
```
Manager decides to refund after issue report
│
└─ PATCH /api/manager/orders/order-123/status
   ├─ nextStatus: "REFUNDED"
   └─ reason: "Refunding due to issue"
```

#### Refund Service Logic
```
PaymentService.refundOrder(input: {
  tenantId, orderId, actorUserId, reason
})
│
├─ Step 1: Fetch Order & Payment
│  ├─ Get order record
│  ├─ Get payment (WHERE payment.orderId = ?)
│  ├─ Verify status allows refund
│  └─ Verify payment status = SUCCESS
│
├─ Step 2: Call Razorpay Refund API
│  ├─ RazorpayPaymentProvider.refund()
│  │  ├─ API: POST /payments/{paymentId}/refund
│  │  ├─ Payload:
│  │  │  ├─ amount: order.totalInPaise
│  │  │  └─ notes: { orderId, reason }
│  │  │
│  │  └─ Response: {
│  │     id: refund_id,
│  │     payment_id, amount,
│  │     status: "processed" or "pending",
│  │     ...
│  │  }
│  │
│  └─ Handle async refund status
│     (can be immediate or delayed)
│
├─ Step 3: Update Payment & Order
│  ├─ Update payment
│  │  ├─ status: SUCCESS → REFUNDED
│  │  ├─ refundId: razorpay_refund_id
│  │  ├─ refundAmountInPaise: order.totalInPaise
│  │  ├─ refundReason: provided reason
│  │  └─ refundInitiatedAt: now
│  │
│  ├─ Update order
│  │  ├─ status: (current) → REFUNDED
│  │  ├─ refundReason: reason
│  │  └─ refundedAt: now
│  │
│  └─ Store both in DB
│
├─ Step 4: Audit Events
│  ├─ EVENT: REFUND_INITIATED
│  │  ├─ AMOUNT: totalInPaise
│  │  ├─ REASON: provided reason
│  │  └─ ACTOR: manager.id
│  │
│  ├─ EVENT: STATE_TRANSITION
│  │  ├─ FROM: order.status
│  │  ├─ TO: REFUNDED
│  │  └─ Actor: manager.id
│  │
│  └─ (Additional event when Razorpay confirms)
│     └─ EVENT: REFUND_COMPLETED
│
└─ Response: {
     payment: { status: "REFUNDED", refundId, ... },
     order: { status: "REFUNDED", ... }
   }
```

**Database State After Refund**:
```
payments table (UPDATED):
  status: "REFUNDED"
  refundId: "rfnd_XXXXX"
  refundAmountInPaise: amount
  refundReason: reason
  refundInitiatedAt: now

orders table (UPDATED):
  status: "REFUNDED"
  refundReason: reason
  refundedAt: now

audit_logs table (MULTIPLE NEW):
  [1] REFUND_INITIATED event
  [2] STATE_TRANSITION: (old_status) → REFUNDED
  [3] REFUND_COMPLETED (when Razorpay confirms)
```

---

## 📊 Phase 9: Order Completion & Analytics

### 9.1 Complete Order
**Endpoint**: `PATCH /api/manager/orders/{orderId}/status`

```
PATCH /api/manager/orders/order-123/status
├─ Input: { nextStatus: "COMPLETED" }
│
├─ ManagerService.updateOrderStatus()
│  ├─ Verify: READY → COMPLETED transition
│  ├─ Update order
│  │  ├─ status: COMPLETED
│  │  └─ completedAt: now
│  │
│  └─ Audit: STATE_TRANSITION event
│
└─ [FINAL STATE] Order completed successfully
```

### 9.2 Customer Views Order History
**Endpoint**: `GET /api/customer/orders`

```
GET /api/customer/orders
├─ Middleware: Auth (CUSTOMER), Tenant Context
│
├─ CustomerService.listOrders()
│  └─ OrderRepository.listForCustomer()
│     ├─ Query: WHERE tenantId = ? AND customerId = ?
│     ├─ Order by: createdAt DESC
│     └─ Include: order_items, payment, status
│
└─ Response: [
     {
       id, status, totalInPaise,
       items: [OrderItem, ...],
       payment: { status, ... },
       createdAt, paidAt, completedAt
     },
     ...
   ]
```

### 9.3 Manager Views Payment Report
**Endpoint**: `GET /api/manager/payments/report`

```
GET /api/manager/payments/report
├─ Middleware: Auth (CANTEEN_MANAGER), Tenant Context
│
├─ ManagerService.getPaymentReport()
│  │
│  ├─ Get manager's assigned canteens
│  │  └─ Query: manager_assignments WHERE managerId = ?
│  │
│  ├─ Query ALL payments for tenant
│  │  └─ Query: payments WHERE tenantId = ?
│  │
│  ├─ Filter by manager's canteens
│  │  └─ Only include: WHERE order.canteenId IN [manager's canteens]
│  │
│  └─ Return: [Payment, ...]
│     ├─ Grouped by: date, status
│     ├─ Include: amount, method, status
│     └─ Show: total paid, pending, failed
│
└─ Response: [
     {
       payment.id, amount, status (SUCCESS/FAILED/REFUNDED),
       method, date,
       order: { id, customer, ... }
     },
     ...
   ]
```

### 9.4 Super Admin Views Platform Analytics
**Endpoint**: `GET /api/admin/analytics/overview`

```
GET /api/admin/analytics/overview
├─ No Tenant Context (platform-wide view)
│
├─ AdminService.getOverviewAnalytics()
│  │
│  ├─ Query 1: Count active colleges
│  │  └─ WHERE isActive = true
│  │
│  ├─ Query 2: Count total customers
│  │  └─ WHERE role = CUSTOMER
│  │
│  ├─ Query 3: Count total managers
│  │  └─ WHERE role = CANTEEN_MANAGER
│  │
│  ├─ Query 4: Count total orders
│  │  └─ Across ALL tenants
│  │
│  ├─ Query 5: Calculate GMV (Gross Merchandise Value)
│  │  └─ SUM(orders.totalInPaise) for status != CANCELLED/FAILED
│  │
│  ├─ Query 6: Orders by status breakdown
│  │  └─ Count GROUP BY status
│  │
│  └─ Query 7: Count paid payments
│     └─ WHERE payment.status = SUCCESS
│
└─ Response: {
     activeTenants, totalCustomers, totalManagers,
     totalOrders, grossMerchandiseValueInPaise,
     paidPayments, ordersByStatus: {
       COMPLETED: X, PREPARING: Y, ...
     }
   }
```

---

## 🔄 Complete Order State Machine

```
┌─────────┐
│ CREATED │ (Order created, no payment attempt)
└────┬────┘
     │ [Customer initiates payment]
     ↓
┌──────────────────┐
│ PAYMENT_PENDING  │ (Waiting for payment confirmation from Razorpay)
└────┬─────┬───────┘
     │     │
     │     └─→ [Payment cancelled/timeout]
     │         ↓
     │      ┌─────────────┐
     │      │ CANCELLED   │ (FINAL)
     │      └─────────────┘
     │
     └─→ [Two possible branches]
         │
         ├─→ [Multiple failure attempts]
         │   ↓
         │   ┌────────────────┐
         │   │ PAYMENT_FAILED │ ──→ [Retry payment]
         │   └────────┬───────┘     ↑
         │            │             │
         │            │ [Customer retries]
         │            └─────────────┘
         │
         └─→ [Payment Success - Razorpay webhook or customer confirmation]
             ↓
         ┌──────┐
         │ PAID │ (Payment confirmed)
         └─┬────┘
           │ [Auto-generate QR]
           ↓
        ┌───────────────┐
        │ QR_GENERATED  │ (QR token ready for manager scan)
        └────┬──────────┘
             │
             ├─→ [QR expires without scan]
             │   ↓
             │   ┌─────────┐
             │   │ EXPIRED │ (FINAL)
             │   └─────────┘
             │
             └─→ [Manager scans QR at canteen]
                 ↓
              ┌───────────┐
              │ CONFIRMED │ (QR verified, order confirmed at canteen)
              └────┬──────┘
                   │ [Manager starts preparation]
                   ↓
              ┌───────────────┐
              │ ISSUE_REPORTED│ (Or report issue anytime)
              └────┬──────────┘
                   │ [If issue → Potentially refund]
                   ↓
              ┌─────────┐
              │ REFUNDED│ (FINAL - money returned)
              └─────────┘
              
         OR continue from CONFIRMED:
              ┌───────────┐
              │ PREPARING │ (Chef preparing order)
              └─────┬─────┘
                    │
                    ├─→ [Takes too long - auto mark delay]
                    │   ↓
                    │   ┌──────────┐
                    │   │ DELAYED  │ (Order delayed notification sent)
                    │   └────┬─────┘
                    │        │
                    │        └─→ [Retry preparing or mark refund]
                    │
                    └─→ [Preparation complete]
                        ↓
                     ┌───────┐
                     │ READY │ (Food ready for customer)
                     └───┬───┘
                         │ [Customer collects order]
                         ↓
                     ┌───────────┐
                     │ COMPLETED │ (FINAL - order fulfilled)
                     └───────────┘
```

---

## 🔐 Multi-Tenancy & Security Implementation

### 🔒 Tenant Isolation Strategy
Every business-logic query includes `tenantId` filter:

```typescript
// Example: OrderRepository.listForCustomer()
WHERE tenantId = ? AND customerId = ?

// Example: PaymentRepository.findByOrderId()
WHERE tenantId = ? AND orderId = ?
```

### 🛡️ Access Control Layers
1. **Authentication**: JWT token with userId, tenantId
2. **Authorization**: Role check (SUPER_ADMIN, CANTEEN_MANAGER, CUSTOMER)
3. **Tenant Context**: Verify user.tenantId matches request tenantId
4. **Resource Ownership**: Verify resource belongs to user/role
5. **Manager Canteen Access**: Verify manager assigned to canteen

### 🔑 Key Security Features
- **Password Hashing**: bcryptjs (10 rounds)
- **Token Rotation**: Refresh token auto-rotation on each refresh
- **Signature Verification**: Razorpay webhook & payment signature validation
- **Idempotency**: Prevent duplicate charges with idempotencyKey
- **Audit Trail**: Complete event logging for compliance
- **Rate Limiting**: Per-IP rate limits on auth endpoints

---

## 📝 Audit & Logging

Every critical operation is logged:

```
audit_logs table contains:
├─ Entity Type: ORDER, PAYMENT, QR_TOKEN, USER, COLLEGE, MENU_ITEM, AUTH
├─ Event Type:
│  ├─ STATE_TRANSITION (order status changes)
│  ├─ PAYMENT_INITIATED, PAYMENT_SUCCEEDED, PAYMENT_FAILED
│  ├─ REFUND_INITIATED, REFUND_COMPLETED
│  ├─ QR_GENERATED, QR_SCANNED
│  ├─ MANAGER_ASSIGNED, MENU_UPDATED, COLLEGE_CREATED
│  ├─ AUTH_LOGIN, AUTH_REGISTER, REFRESH_TOKEN_ROTATED
│  └─ ISSUE_REPORTED, DELAY_MARKED
│
├─ Actor: userId (who made the change)
├─ Timestamp: when the event occurred
├─ Changes: before/after state (if applicable)
└─ Metadata: additional context (reason, amounts, etc.)
```

---

## 📊 Complete Data Flow Diagram

```
SUPER ADMIN
├─ Creates College (Tenant)
├─ Creates Canteen(s)
└─ Assigns Manager(s)

MANAGER
├─ Creates Menu Items
├─ Views Orders (QR_GENERATED & later states)
├─ Scans QR Token
├─ Transitions order state: CONFIRMED → PREPARING → READY → COMPLETED
├─ Handles refunds for issues
└─ Views payment reports

CUSTOMER
├─ Registers with College (Tenant)
├─ Views Menu
├─ Places Order (CREATED state)
├─ Initiates Payment (PAYMENT_PENDING state)
├─ Verifies Payment (via signature check)
│  └─ Payment Success → PAID, QR_GENERATED
│  └─ Payment Failure → PAYMENT_FAILED (can retry)
├─ Views Order (now has QR)
├─ Reports Issues (if order has problems)
│  └─ Triggers Refund process
└─ Receives completed order

RAZORPAY
├─ Receives payment initiation request
├─ Returns providerOrderId
├─ Processes payment (customer enters details)
├─ Sends webhook: payment.captured or payment.failed
└─ Processes refund on request

DATABASE
├─ /colleges (tenants)
├─ /users (with tenantId)
├─ /canteens (with tenantId)
├─ /menu_items (with tenantId)
├─ /orders (with tenantId)
├─ /payments (with tenantId)
├─ /qr_tokens (with tenantId)
└─ /audit_logs (complete trail)
```

---

## ✅ Key Implementation Highlights

### 1. **State Machine Validation**
All order transitions validated against legal state machine before execution.

### 2. **Idempotency**
Payment initiation uses idempotencyKey to prevent duplicate charges if request is retried.

### 3. **QR Token Security**
- Generated after successful payment only
- Hashed in database
- Signed JWT format for validation
- Expires after 15 minutes (configurable)
- One-time use (marked as USED when scanned)

### 4. **Multi-Channel Payment Confirmation**
- Customer verification (direct signature check)
- Webhook verification (Razorpay async notification)
- Both trigger same order state transitions

### 5. **Row-Level Multi-Tenancy**
Every table has tenantId; queries filter by it to prevent cross-tenant data leakage.

### 6. **Comprehensive Audit**
Every state change logged with actor, timestamp, before/after state, and reason.

### 7. **Failure Handling**
- Payment failures → order stays in PAYMENT_FAILED (allows retry)
- QR expiry → order transitions to EXPIRED
- Order delays → auto-marked after configurable time
- Issues → order transitions to ISSUE_REPORTED, refund possible

---

## 🚀 Summary

**Happy Path Duration** (Super Admin → Customer Order Completion):
```
T=0s:   Super Admin creates College
T+5s:   Admin assigns Manager
T+10s:  Manager adds Menu Items
T+20s:  Customer registers
T+25s:  Customer browses menu, places order (CREATED)
T+26s:  Customer initiates payment (PAYMENT_PENDING)
T+30s:  Payment callback received (PAID, QR_GENERATED)
T+32s:  Manager scans QR (CONFIRMED)
T+35s:  Manager marks PREPARING
T+60s:  Manager marks READY
T+65s:  Customer picks up (COMPLETED) ✓
```

**Failure Path** (Payment → Refund):
```
T=26s:  Customer initiates payment (PAYMENT_PENDING)
T=35s:  Payment fails (PAYMENT_FAILED)  ❌
T=40s:  Customer retries payment (PAYMENT_PENDING again)
T=45s:  Payment succeeds (PAID, QR_GENERATED)
T=50s:  Manager scans (CONFIRMED)
T=60s:  Customer reports issue (ISSUE_REPORTED)
T=65s:  Manager processes refund (REFUNDED) ✓
        Money returned to customer's payment method
```

---

**Document Version**: 1.0  
**Last Updated**: 2026-04-14  
**Status**: Complete Implementation

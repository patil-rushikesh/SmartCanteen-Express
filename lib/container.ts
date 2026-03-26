import { prisma } from './prisma.js';
import {
  AnalyticsRepository,
  AuditLogRepository,
  CanteenRepository,
  CollegeRepository,
  ManagerAssignmentRepository,
  MenuItemRepository,
  OrderRepository,
  PaymentRepository,
  QRTokenRepository,
  RefreshTokenRepository,
  RoleRepository,
  UserRepository
} from '../repositories/index.js';
import { AuditService } from '../services/shared/audit.service.js';
import { QrService } from '../services/shared/qr.service.js';
import { RazorpayPaymentProvider } from '../services/payments/razorpay-payment-provider.js';
import { PaymentService } from '../services/payments/payment.service.js';
import { AuthService } from '../services/auth/auth.service.js';
import { AdminService } from '../services/admin/admin.service.js';
import { CustomerService } from '../services/customer/customer.service.js';
import { ManagerService } from '../services/manager/manager.service.js';

const roleRepository = new RoleRepository(prisma);
const collegeRepository = new CollegeRepository(prisma);
const canteenRepository = new CanteenRepository(prisma);
const userRepository = new UserRepository(prisma);
const managerAssignmentRepository = new ManagerAssignmentRepository(prisma);
const menuItemRepository = new MenuItemRepository(prisma);
const orderRepository = new OrderRepository(prisma);
const paymentRepository = new PaymentRepository(prisma);
const qrTokenRepository = new QRTokenRepository(prisma);
const refreshTokenRepository = new RefreshTokenRepository(prisma);
const auditLogRepository = new AuditLogRepository(prisma);
const analyticsRepository = new AnalyticsRepository(prisma);

const auditService = new AuditService(auditLogRepository);
const qrService = new QrService(qrTokenRepository, orderRepository, auditService);
const paymentProvider = new RazorpayPaymentProvider();
const paymentService = new PaymentService(
  paymentRepository,
  orderRepository,
  auditService,
  qrService,
  paymentProvider
);

export const container = {
  authService: new AuthService(
    userRepository,
    roleRepository,
    refreshTokenRepository,
    collegeRepository,
    auditService
  ),
  adminService: new AdminService(
    collegeRepository,
    canteenRepository,
    roleRepository,
    userRepository,
    managerAssignmentRepository,
    analyticsRepository,
    auditService
  ),
  customerService: new CustomerService(
    menuItemRepository,
    orderRepository,
    qrTokenRepository,
    auditService
  ),
  managerService: new ManagerService(
    managerAssignmentRepository,
    canteenRepository,
    menuItemRepository,
    orderRepository,
    paymentRepository,
    auditService,
    qrService,
    paymentService
  ),
  paymentService
};

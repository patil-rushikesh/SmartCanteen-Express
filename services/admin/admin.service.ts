import { AppError } from '../../utils/errors.js';
import { hashPassword } from '../../utils/password.js';
import {
  AnalyticsRepository,
  CanteenRepository,
  CollegeRepository,
  ManagerAssignmentRepository,
  RoleRepository,
  UserRepository
} from '../../repositories/index.js';
import { AuditService } from '../shared/audit.service.js';
import { AuditEntityType, AuditEventType, RoleCode } from '../../models/domain.js';

const createSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export class AdminService {
  constructor(
    private readonly collegeRepository: CollegeRepository,
    private readonly canteenRepository: CanteenRepository,
    private readonly roleRepository: RoleRepository,
    private readonly userRepository: UserRepository,
    private readonly managerAssignmentRepository: ManagerAssignmentRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly auditService: AuditService
  ) {}

  listColleges() {
    return this.collegeRepository.list();
  }

  async createCollege(input: {
    name: string;
    code: string;
    contactEmail: string;
    contactPhone?: string;
    address?: string;
    defaultCanteenName: string;
    defaultCanteenLocation?: string;
  }) {
    const college = await this.collegeRepository.create({
      name: input.name,
      slug: createSlug(input.name),
      code: input.code,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      address: input.address
    });

    const canteen = await this.canteenRepository.create({
      name: input.defaultCanteenName,
      location: input.defaultCanteenLocation,
      college: { connect: { id: college.id } }
    });

    await this.auditService.recordEvent({
      tenantId: college.id,
      entityType: AuditEntityType.COLLEGE,
      eventType: AuditEventType.COLLEGE_CREATED,
      metadata: { canteenId: canteen.id }
    });

    return { college, canteen };
  }

  async updateCollege(
    collegeId: string,
    input: {
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      isActive?: boolean;
    }
  ) {
    const college = await this.collegeRepository.findById(collegeId);
    if (!college) {
      throw new AppError(404, 'College not found');
    }

    const updated = await this.collegeRepository.update(collegeId, {
      name: input.name,
      slug: input.name ? createSlug(input.name) : undefined,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      address: input.address,
      isActive: input.isActive
    });

    await this.auditService.recordEvent({
      tenantId: collegeId,
      entityType: AuditEntityType.COLLEGE,
      eventType: AuditEventType.COLLEGE_UPDATED
    });

    return updated;
  }

  async deactivateCollege(collegeId: string) {
    const college = await this.collegeRepository.findById(collegeId);
    if (!college) {
      throw new AppError(404, 'College not found');
    }

    return this.collegeRepository.update(collegeId, { isActive: false });
  }

  async assignManager(input: {
    tenantId: string;
    canteenId: string;
    email: string;
    password: string;
    fullName: string;
    phone: string;
  }) {
    const college = await this.collegeRepository.findById(input.tenantId);
    if (!college?.isActive) {
      throw new AppError(404, 'College not found or inactive');
    }

    const canteen = await this.canteenRepository.findById(input.canteenId);
    if (!canteen || canteen.tenantId !== input.tenantId) {
      throw new AppError(404, 'Canteen not found for tenant');
    }

    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError(409, 'Email is already registered');
    }

    const managerRole = await this.roleRepository.findByCode(RoleCode.CANTEEN_MANAGER);
    if (!managerRole) {
      throw new AppError(500, 'Manager role is not configured');
    }

    const user = await this.userRepository.createRaw({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      phone: input.phone,
      college: { connect: { id: input.tenantId } },
      role: { connect: { id: managerRole.id } }
    });

    const assignment = await this.managerAssignmentRepository.create({
      college: { connect: { id: input.tenantId } },
      canteen: { connect: { id: input.canteenId } },
      manager: { connect: { id: user.id } }
    });

    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      actorUserId: user.id,
      entityType: AuditEntityType.USER,
      eventType: AuditEventType.MANAGER_ASSIGNED,
      metadata: { canteenId: input.canteenId }
    });

    return assignment;
  }

  listManagers(tenantId: string) {
    return this.userRepository.listManagers(tenantId);
  }

  async getOverviewAnalytics() {
    const [activeTenants, totalCustomers, totalManagers, totalOrders, gmv, ordersByStatus, paidPayments] =
      await this.analyticsRepository.getOverview();

    return {
      activeTenants,
      totalCustomers,
      totalManagers,
      totalOrders,
      paidPayments,
      grossMerchandiseValueInPaise: gmv._sum.totalInPaise ?? 0,
      ordersByStatus
    };
  }
}

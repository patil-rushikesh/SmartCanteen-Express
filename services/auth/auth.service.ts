import jwt from 'jsonwebtoken';
import { AppError } from '../../utils/errors.js';
import { comparePassword, hashPassword } from '../../utils/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type JwtSessionPayload
} from '../../utils/jwt.js';
import { createSha256Hash } from '../../utils/crypto.js';
import { AuditService } from '../shared/audit.service.js';
import { CollegeRepository, RefreshTokenRepository, RoleRepository, UserRepository } from '../../repositories/index.js';
import { AuditEntityType, AuditEventType, RoleCode } from '../../models/domain.js';

const sanitizeUser = (user: {
  id: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  phone: string;
  studentFacultyId?: string | null;
  yearOfStudy?: number | null;
  role: { code: RoleCode; name?: string | null };
}) => ({
  id: user.id,
  tenantId: user.tenantId,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone,
  studentFacultyId: user.studentFacultyId ?? null,
  yearOfStudy: user.yearOfStudy ?? null,
  role: user.role.code
});

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly collegeRepository: CollegeRepository,
    private readonly auditService: AuditService
  ) {}

  private issueSessionTokens(payload: JwtSessionPayload) {
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const decodedRefresh = jwt.decode(refreshToken) as { exp?: number } | null;

    if (!decodedRefresh?.exp) {
      throw new AppError(500, 'Failed to create refresh token');
    }

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: new Date(decodedRefresh.exp * 1000)
    };
  }

  async registerCustomer(input: {
    tenantId: string;
    email: string;
    password: string;
    fullName: string;
    phone: string;
    studentFacultyId?: string;
    yearOfStudy?: number;
  }) {
    const existingCollege = await this.collegeRepository.findById(input.tenantId);
    if (!existingCollege || !existingCollege.isActive) {
      throw new AppError(404, 'College tenant not found or inactive');
    }

    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError(409, 'Email is already registered');
    }

    const customerRole = await this.roleRepository.findByCode(RoleCode.CUSTOMER);
    if (!customerRole) {
      throw new AppError(500, 'Customer role is not configured');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.userRepository.createRaw({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      studentFacultyId: input.studentFacultyId,
      yearOfStudy: input.yearOfStudy,
      college: { connect: { id: input.tenantId } },
      role: { connect: { id: customerRole.id } }
    });

    const payload: JwtSessionPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role.code,
      email: user.email
    };

    const session = this.issueSessionTokens(payload);
    await this.refreshTokenRepository.create({
      tokenHash: createSha256Hash(session.refreshToken),
      expiresAt: session.refreshExpiresAt,
      user: { connect: { id: user.id } },
      college: { connect: { id: input.tenantId } }
    });

    await this.auditService.recordEvent({
      tenantId: input.tenantId,
      actorUserId: user.id,
      entityType: AuditEntityType.AUTH,
      eventType: AuditEventType.AUTH_REGISTER
    });

    return {
      user: sanitizeUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    };
  }

  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.isActive) {
      throw new AppError(401, 'Invalid credentials');
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid credentials');
    }

    if (user.tenantId) {
      const college = await this.collegeRepository.findById(user.tenantId);
      if (!college?.isActive) {
        throw new AppError(403, 'Tenant is inactive');
      }
    }

    const payload: JwtSessionPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role.code,
      email: user.email
    };

    const session = this.issueSessionTokens(payload);
    await this.refreshTokenRepository.create({
      tokenHash: createSha256Hash(session.refreshToken),
      expiresAt: session.refreshExpiresAt,
      user: { connect: { id: user.id } },
      college: user.tenantId ? { connect: { id: user.tenantId } } : undefined
    });

    await this.auditService.recordEvent({
      tenantId: user.tenantId,
      actorUserId: user.id,
      entityType: AuditEntityType.AUTH,
      eventType: AuditEventType.AUTH_LOGIN
    });

    return {
      user: sanitizeUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    };
  }

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = createSha256Hash(refreshToken);
    const persistedToken = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!persistedToken || persistedToken.revokedAt || persistedToken.expiresAt.getTime() <= Date.now()) {
      throw new AppError(401, 'Refresh token is invalid or expired');
    }

    await this.refreshTokenRepository.revoke(persistedToken.id);

    const nextSession = this.issueSessionTokens(payload);
    await this.refreshTokenRepository.create({
      tokenHash: createSha256Hash(nextSession.refreshToken),
      expiresAt: nextSession.refreshExpiresAt,
      user: { connect: { id: payload.sub } },
      college: payload.tenantId ? { connect: { id: payload.tenantId } } : undefined
    });

    await this.auditService.recordEvent({
      tenantId: payload.tenantId,
      actorUserId: payload.sub,
      entityType: AuditEntityType.AUTH,
      eventType: AuditEventType.REFRESH_TOKEN_ROTATED
    });

    return {
      accessToken: nextSession.accessToken,
      refreshToken: nextSession.refreshToken
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findDetailedById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    return sanitizeUser(user);
  }
}

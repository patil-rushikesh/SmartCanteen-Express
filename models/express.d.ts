import type { RoleCode } from './domain.js';

declare global {
  namespace Express {
    interface UserContext {
      userId: string;
      tenantId: string | null;
      role: RoleCode;
      email: string;
    }

    interface Request {
      user?: UserContext;
      tenantId?: string;
      rawBody?: string;
    }
  }
}

export {};

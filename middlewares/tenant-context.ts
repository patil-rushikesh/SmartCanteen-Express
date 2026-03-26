import { NextFunction, Request, Response } from 'express';

export const resolveTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  const headerTenantId = req.headers['x-tenant-id'];
  const headerValue = Array.isArray(headerTenantId) ? headerTenantId[0] : headerTenantId;
  const paramTenantId = Array.isArray(req.params.tenantId) ? req.params.tenantId[0] : req.params.tenantId;
  const bodyTenantId = Array.isArray(req.body?.tenantId) ? req.body.tenantId[0] : req.body?.tenantId;
  const queryTenantId = Array.isArray(req.query.tenantId) ? req.query.tenantId[0] : req.query.tenantId;

  req.tenantId =
    req.user?.tenantId ??
    headerValue?.toString() ??
    paramTenantId?.toString() ??
    bodyTenantId?.toString() ??
    queryTenantId?.toString();

  next();
};

export const requireTenantContext = (req: Request, res: Response, next: NextFunction) => {
  if (!req.tenantId) {
    return res.status(400).json({ success: false, message: 'Tenant context is required' });
  }

  next();
};

import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { RoleCode } from '../models/domain.js';

export interface JwtSessionPayload {
  sub: string;
  tenantId: string | null;
  role: RoleCode;
  email: string;
}

export interface QrTokenPayload {
  orderId: string;
  tenantId: string;
  exp: number;
  nonce: string;
}

const accessExpiresIn = env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'];
const refreshExpiresIn = env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'];

export const signAccessToken = (payload: JwtSessionPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: accessExpiresIn });

export const signRefreshToken = (payload: JwtSessionPayload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: refreshExpiresIn });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtSessionPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtSessionPayload;

export const signQrToken = (payload: QrTokenPayload) =>
  jwt.sign(payload, env.JWT_QR_SECRET);

export const verifyQrToken = (token: string) =>
  jwt.verify(token, env.JWT_QR_SECRET) as QrTokenPayload;

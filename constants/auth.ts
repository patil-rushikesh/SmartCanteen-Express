export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenUser {
  id: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  phone: string;
  role: string;
}

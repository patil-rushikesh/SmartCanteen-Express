import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

type JsonRecord = Record<string, unknown>;

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getEnvSegment = (): 'dev' | 'prod' => process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

const resolveSecretId = (): string => {
  const explicitSecretId = process.env.AWS_SECRET_ID?.trim();
  if (explicitSecretId) {
    return explicitSecretId;
  }

  const prefix = process.env.AWS_SECRET_PREFIX?.trim() || 'smart-canteen/backend';
  return `${prefix}/${getEnvSegment()}`;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readSecretPayload = (secretValue: { SecretString?: string; SecretBinary?: Uint8Array }): string => {
  if (secretValue.SecretString) {
    return secretValue.SecretString;
  }

  if (secretValue.SecretBinary) {
    return Buffer.from(secretValue.SecretBinary).toString('utf8');
  }

  throw new Error('Secret has neither SecretString nor SecretBinary payload');
};

const parseSecretJson = (rawSecret: string): JsonRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSecret);
  } catch (error) {
    throw new Error(`Failed to parse Secrets Manager JSON payload: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Secrets Manager payload must be a JSON object');
  }

  return parsed as JsonRecord;
};

const applySecretsToProcessEnv = (values: JsonRecord): void => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) {
      continue;
    }

    process.env[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
};

export const loadSecretsToProcessEnv = async (): Promise<void> => {
  if (process.env.AWS_SECRETS_DISABLED === 'true') {
    return;
  }

  const secretId = resolveSecretId();
  const maxAttempts = toPositiveInt(process.env.AWS_SECRET_FETCH_RETRIES, 3);
  const baseDelayMs = toPositiveInt(process.env.AWS_SECRET_FETCH_BASE_DELAY_MS, 500);
  // No credentials are passed here intentionally: AWS SDK v3 resolves credentials from the default chain.
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const secret = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
      const payload = readSecretPayload(secret);
      const values = parseSecretJson(payload);
      applySecretsToProcessEnv(values);
      return;
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        const waitMs = baseDelayMs * 2 ** (attempt - 1);
        console.warn(`[Secrets] Fetch attempt ${attempt}/${maxAttempts} failed. Retrying in ${waitMs}ms.`);
        await sleep(waitMs);
      }
    }
  }

  throw new Error(
    `[Secrets] Failed to load secret "${secretId}" after ${maxAttempts} attempts: ${lastError?.message ?? 'Unknown error'}`
  );
};

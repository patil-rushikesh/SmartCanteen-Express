import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseUrl, main } from '../scripts/container.mjs';
const env = { DB_HOST: 'db.internal', DB_NAME: 'canteen', DB_USER: 'user@tenant', DB_PASSWORD: 'p@ss:/?#word', DB_SSL_CA: '/app/certs/rds.pem' };
test('encodes RDS credentials and verifies TLS for the API', () => {
  const url = new URL(databaseUrl(env));
  assert.equal(decodeURIComponent(url.username), env.DB_USER);
  assert.equal(decodeURIComponent(url.password), env.DB_PASSWORD);
  assert.equal(url.searchParams.get('sslmode'), 'verify-full');
  assert.equal(url.searchParams.get('sslrootcert'), env.DB_SSL_CA);
});
test('uses Prisma CLI certificate parameters for migrations', () => {
  const url = new URL(databaseUrl(env, true));
  assert.equal(url.searchParams.get('sslaccept'), 'strict');
  assert.equal(url.searchParams.get('sslcert'), env.DB_SSL_CA);
  assert.equal(url.searchParams.has('sslrootcert'), false);
});
test('preserves explicit URLs for local development', () => {
  assert.equal(databaseUrl({ DATABASE_URL: 'postgresql://localhost/local' }), 'postgresql://localhost/local');
});
test('fails before launch with incomplete credentials or unknown commands', async () => {
  assert.throws(() => databaseUrl({}), /Missing DB_HOST/);
  await assert.rejects(() => main('unknown'), /Unknown container command/);
});

test('production refuses demo seeding and implicit startup migrations', async () => {
  const original = { APP_ENV: process.env.APP_ENV, SEED_DEMO_DATA: process.env.SEED_DEMO_DATA, RUN_MIGRATIONS: process.env.RUN_MIGRATIONS };
  try {
    process.env.APP_ENV = 'production';
    await assert.rejects(() => main('seed'), /Production forbids/);
    process.env.SEED_DEMO_DATA = 'true';
    await assert.rejects(() => main('serve'), /Production forbids/);
    delete process.env.SEED_DEMO_DATA;
    process.env.RUN_MIGRATIONS = 'true';
    await assert.rejects(() => main('serve'), /Production forbids/);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

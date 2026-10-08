import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const good = {
  APP_ENV: 'production', DATABASE_URL: 'postgresql://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), JWT_QR_SECRET: 'c'.repeat(40),
  REDIS_URL: 'rediss://cache.example:6379', CORS_ORIGIN: 'https://canteen.example.com',
  PAYMENT_PROVIDER_MODE: 'razorpay', RAZORPAY_KEY_ID: 'rzp_live_example',
  RAZORPAY_KEY_SECRET: 'payment-secret-for-test-only', RAZORPAY_WEBHOOK_SECRET: 'webhook-secret-for-test-only',
  DOTENV_CONFIG_PATH: '/dev/null'
};
function parse(overrides) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./dist/utils/env.js')"], {
    env: { ...process.env, ...good, ...overrides }, encoding: 'utf8'
  });
}
test('production accepts explicit secure settings', () => assert.equal(parse({}).status, 0));
for (const [name, overrides] of [
  ['default JWT', { JWT_ACCESS_SECRET: 'smart-canteen-access-secret' }],
  ['reused JWT', { JWT_QR_SECRET: good.JWT_ACCESS_SECRET }],
  ['fake payments', { PAYMENT_PROVIDER_MODE: 'fake' }],
  ['test payment key', { RAZORPAY_KEY_ID: 'rzp_test_example' }],
  ['unencrypted cache', { REDIS_URL: 'redis://localhost:6379' }],
  ['HTTP origin', { CORS_ORIGIN: 'http://example.com' }],
  ['wildcard origin', { CORS_ORIGIN: '*' }]
]) test(`production rejects ${name}`, () => assert.notEqual(parse(overrides).status, 0));

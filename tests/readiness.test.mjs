import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('unavailable dependencies fail readiness while liveness remains available', async () => {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, APP_ENV: 'test', NODE_ENV: 'test', PORT: '0',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/unavailable?connect_timeout=1',
      REDIS_URL: '', PAYMENT_PROVIDER_MODE: 'fake', DOTENV_CONFIG_PATH: '/dev/null' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  const exited = once(child, 'exit');
  try {
    const [message] = await Promise.race([
      once(child, 'message'),
      exited.then(() => { throw new Error('API exited before listening'); }),
      new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('API startup timeout')), 10000); timeout.unref(); })
    ]);
    const base = `http://127.0.0.1:${message.port}`;
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-powered-by'), null);
    const ready = await fetch(`${base}/api/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: 'unavailable' });
  } finally {
    child.kill('SIGTERM');
    await exited;
  }
});

import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';

// ECS injects the SSM credentials without storing their value in Terraform.
export function databaseUrl(env, migration = false) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  const url = new URL(`postgresql://${env.DB_HOST}:${env.DB_PORT || '5432'}/${env.DB_NAME}`);
  url.username = env.DB_USER;
  url.password = env.DB_PASSWORD;
  url.searchParams.set('schema', 'public');
  if (env.DB_SSL_CA) {
    url.searchParams.set('sslmode', migration ? 'require' : 'verify-full');
    url.searchParams.set(migration ? 'sslcert' : 'sslrootcert', env.DB_SSL_CA);
    if (migration) url.searchParams.set('sslaccept', 'strict');
  }
  return url.toString();
}

export async function main(mode = 'serve') {
  if (process.env.APP_ENV === 'production' &&
      (mode === 'seed' || process.env.SEED_DEMO_DATA === 'true' || process.env.RUN_MIGRATIONS === 'true')) {
    throw new Error('Production forbids demo seeding and startup migrations; use a separate migration task');
  }
  const migrate = () => {
    const result = spawnSync(process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config=prisma.config.ts'],
      { stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl(process.env, true) } });
    if (result.error || result.status !== 0) throw new Error('Database migration failed');
  };
  if (mode === 'migrate') return migrate();
  if (mode !== 'serve' && mode !== 'seed') throw new Error(`Unknown container command: ${mode}`);
  if (mode === 'serve' && process.env.RUN_MIGRATIONS === 'true') migrate();
  process.env.DATABASE_URL = databaseUrl(process.env);
  if (mode === 'seed' || process.env.SEED_DEMO_DATA === 'true') {
    if (process.env.SEED_DEMO_DATA !== 'true') throw new Error('Demo seeding requires SEED_DEMO_DATA=true');
    const result = spawnSync(process.execPath, ['dist/scripts/seed.js'], { stdio: 'inherit', env: process.env });
    if (result.error || result.status !== 0) throw new Error('Demo seed failed');
    if (mode === 'seed') return;
  }
  const child = spawn(process.execPath,
    ['node_modules/pm2/bin/pm2-runtime', 'start', 'ecosystem.config.cjs'],
    { stdio: 'inherit', env: process.env });
  const forward = signal => child.kill(signal);
  const terminate = () => forward('SIGTERM');
  const interrupt = () => forward('SIGINT');
  process.once('SIGTERM', terminate);
  process.once('SIGINT', interrupt);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  } finally {
    process.removeListener('SIGTERM', terminate);
    process.removeListener('SIGINT', interrupt);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  await main(process.argv[2]);
}

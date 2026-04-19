#!/bin/sh
set -e

echo "Waiting for database..."


echo "Database ready"

echo "Running migrations..."
pnpm exec prisma migrate deploy --config=./prisma.config.ts

echo "Seeding database..."
pnpm seed || echo "Seed already applied"

echo "Starting server..."
node dist/index.js
#!/bin/sh
set -e
echo "Applying Prisma schema to database..."
npx prisma db push --skip-generate
echo "Starting KOYN API..."
exec node dist/index.js

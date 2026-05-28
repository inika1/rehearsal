#!/bin/bash
set -e

echo "[rehearsal-backend] Starting deployment setup..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "[rehearsal-backend] Installing dependencies..."
  npm ci
fi

echo "[rehearsal-backend] Starting server..."
npm start

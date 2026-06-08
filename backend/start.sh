#!/bin/bash
set -e

echo "[bridge-backend] Starting deployment setup..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "[bridge-backend] Installing dependencies..."
  npm ci
fi

echo "[bridge-backend] Starting server..."
npm start

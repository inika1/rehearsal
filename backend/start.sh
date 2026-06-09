#!/bin/bash
set -e

echo "[bridge-backend] Starting..."
npm ci --omit=dev
npm start

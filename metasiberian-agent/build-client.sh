#!/bin/bash
# Exit immediately if a command exits with a non-zero status.
set -e

echo "Starting client build process via build-client.sh..."

# Ensure Bun is in PATH
export PATH="$HOME/.bun/bin:$PATH"

# IMPORTANT: Dependencies must be installed first (bun install runs before this script)
# This ensures node_modules/@elizaos/server exists before we try to copy client to it

# Check if packages/client directory exists
if [ ! -d "../packages/client" ]; then
  echo "⚠ Warning: ../packages/client directory not found. Skipping client build."
  exit 0
fi

echo "Building client dependencies first..."

# Build core package (required by client)
if [ -d "../packages/core" ]; then
  echo "Building @elizaos/core..."
  cd ../packages/core
  bun run build
  cd ../../metasiberian-agent
else
  echo "⚠ Warning: ../packages/core directory not found. Skipping @elizaos/core build."
fi

# Build api-client package (required by client)
if [ -d "../packages/api-client" ]; then
  echo "Building @elizaos/api-client..."
  cd ../packages/api-client
  bun run build
  cd ../../metasiberian-agent
else
  echo "⚠ Warning: ../packages/api-client directory not found. Skipping @elizaos/api-client build."
fi

echo "Building client..."

# Install client dependencies first
cd ../packages/client
bun install
cd ../../metasiberian-agent

# Build client using vite directly (skip type checking for faster build)
cd ../packages/client
bunx vite build
cd ../../metasiberian-agent

# Server uses client from node_modules/@elizaos/server/dist/client
# Copy built client there so server can use updated version
# NOTE: node_modules should exist after bun install (which runs before this script)
if [ ! -d "../packages/client/dist" ]; then
  echo "✗ Error: Client build failed - dist directory not found"
  exit 1
fi

if [ ! -d "node_modules/@elizaos/server" ]; then
  echo "⚠ Warning: node_modules/@elizaos/server not found. This may be normal if dependencies aren't installed yet."
  echo "   Client will be copied after bun install completes."
  exit 0
fi

echo "Copying client dist to server node_modules..."
mkdir -p node_modules/@elizaos/server/dist/client
rm -rf node_modules/@elizaos/server/dist/client/*
cp -r ../packages/client/dist/* node_modules/@elizaos/server/dist/client/

# Verify the copy worked
if [ -f "node_modules/@elizaos/server/dist/client/index.html" ]; then
  echo "✓ Client copied to server successfully"
  # Verify title is correct
  if grep -q "AiChat - Client" node_modules/@elizaos/server/dist/client/index.html; then
    echo "✓ Title is correct: AiChat - Client"
  else
    echo "⚠ Warning: Title may not be correct"
    grep -i title node_modules/@elizaos/server/dist/client/index.html
  fi
else
  echo "✗ Error: Client copy to server failed"
  exit 1
fi

echo "Client build process completed."


#!/bin/bash
set -e

echo "Building client dependencies first..."

# Build core package (required by client)
if [ -d "../packages/core" ]; then
  echo "Building @elizaos/core..."
  cd ../packages/core && bun run build && cd ../../metasiberian-agent
fi

# Build api-client package (required by client)
if [ -d "../packages/api-client" ]; then
  echo "Building @elizaos/api-client..."
  cd ../packages/api-client && bun run build && cd ../../metasiberian-agent
fi

echo "Building client..."
# Install client dependencies first
cd ../packages/client && bun install && cd ../../metasiberian-agent
# Build client using vite directly (skip type checking for faster build)
cd ../packages/client && bunx vite build && cd ../../metasiberian-agent

# Server uses client from node_modules/@elizaos/server/dist/client
# Copy built client there so server can use updated version
if [ -d "../packages/client/dist" ] && [ -d "node_modules/@elizaos/server" ]; then
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
else
  echo "⚠ Warning: Client dist or node_modules/@elizaos/server not found"
fi


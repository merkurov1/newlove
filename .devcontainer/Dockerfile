# Simple Dockerfile for Codespaces (uses base JS Node image)
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:18

# Install git and other utilities
RUN apt-get update && apt-get install -y git curl ca-certificates && rm -rf /var/lib/apt/lists/*

USER vscode

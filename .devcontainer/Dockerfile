# Simple Dockerfile for Codespaces (uses base JS Node image)
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:18

# Install git and other utilities
RUN apt-get update && apt-get install -y git curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Ensure the 'vscode' user exists (some base images may not include it).
# If it doesn't, create it with a home directory and add to sudo/dialout groups.
RUN if ! id -u vscode >/dev/null 2>&1; then \
    useradd -m -s /bin/bash -G sudo,dialout vscode || true; \
    echo "vscode ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/vscode || true; \
    chmod 0440 /etc/sudoers.d/vscode || true; \
    fi

USER vscode

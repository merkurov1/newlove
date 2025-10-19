Deploy instructions (local)
=========================

This repository includes a deploy helper script `scripts/deploy_hardhat.js` that deploys the `NeutralHeart` contract and optionally sets baseURI and verifies on Polygonscan.

Quick steps (recommended on your machine)

1) Ensure Node.js 22.x LTS is installed locally.
2) Copy `.env.deploy.local` to the project root on your machine and ensure it contains:
   - DEPLOY_PRIVATE_KEY (0x... private key)
   - POLYGON_RPC_URL (https://polygon-rpc.com/ or your provider)
   - NEUTRAL_HEART_BASEURI (https://.../ipfs/<CID>/)
   - POLYGONSCAN_API_KEY (optional, for verification)
3) Run:

```bash
git clone <repo> && cd newlove
# place your .env.deploy.local here
bash deploy_local.sh
```

What the script does:
- runs `npm ci` to install dependencies
- compiles contracts via Hardhat
- runs `scripts/deploy_hardhat.js` on the `polygon` network (it will use DEPLOY_PRIVATE_KEY and POLYGON_RPC_URL from `.env.deploy.local`)

If you need me to run the deploy from here (the container) I can try, but the environment here fails to install native modules (error during `@swc/core` postinstall). The safest approach is to run the above on your machine or a CI runner that supports Node 22.

If you want me to continue trying in this container, say "try again here" and I'll attempt other workarounds (installing via pnpm, or fetching a prebuilt hardhat binary), but success isn't guaranteed due to environment restrictions.

Codespace troubleshooting
------------------------
If you open this repository in Codespaces, the devcontainer now targets Node 22. After pulling these changes, rebuild the container ("Rebuild Container" in VS Code). This ensures the container image matches the repository's expected Node version and has build tools installed.

If you still see install errors (for example `@swc/core` postinstall crashes or `Bus error`), try these steps:

1. Rebuild the Codespace devcontainer from the command palette.
2. If problems persist, run the following in the container terminal to get diagnostic logs:

```bash
node -v
npm -v
npm ci --loglevel verbose 2>&1 | tee npm-install.log
tail -n 200 npm-install.log
```

3. If the log shows failures during native module postinstall, consider running the install on a machine with more memory or using the project's CI (GitHub Actions) which uses Ubuntu runners with Node 20/22 and more resources.


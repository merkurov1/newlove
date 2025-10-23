Developer setup for Codespaces / local dev
=======================================

This project requires Node 22+ and several native modules during install (for example, `@swc/core`). If your Codespace or machine shows install failures, follow these steps:

1) Ensure Node 22 is active. The repo includes a `.nvmrc` with `22`.

2) Rebuild the Codespace or container so the Node version is respected. In Codespaces: "Rebuild Container" after pull.

3) Run the helper script that attempts `npm ci` and falls back to `pnpm`:

```bash
./scripts/setup_dev.sh
```

4) If you still see native build failures like `@swc/core` Bus errors:
   - Increase Codespace RAM / CPU if possible.
   - Run install on a local machine or CI runner (Ubuntu GitHub Actions uses Node 20/22 and usually succeeds).

   Tip: In Codespaces you can skip the `prisma generate` postinstall by setting the environment variable when rebuilding the container:

   ```
   # Open Codespaces rebuild UI and set this as a secret in the container environment
   PRISMA_GENERATE=0
   ```

   Then click "Rebuild Container". This prevents `prisma generate` from running during `npm ci` in the container and avoids errors when `prisma/schema.prisma` isn't provided.
   - Consider using `pnpm` which often installs prebuilt binaries.

5) If the project still fails, open an issue and attach the `npm-debug.log` or the output from the script above.

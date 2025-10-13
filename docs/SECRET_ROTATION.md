# Secret Rotation Checklist

This checklist helps remove service_role keys or other secrets from the repository and rotate them safely.

Steps:
1. Remove any committed secrets from the repository (do not push removals until you have a rotation plan).
2. Add `.env` to `.gitignore` (this repo already ignores `.env*`).
3. Create a new service_role key in Supabase and store it in your secret manager (Vercel/Netlify/Github Actions secrets).
4. Update CI/hosting environment variables with the new key.
5. Rotate keys in any other systems that used the old key.
6. Revoke the old service_role key in Supabase.

Notes:
- Never store the service_role key in plaintext in the repo.
- If a key is leaked, rotate immediately and audit access logs.

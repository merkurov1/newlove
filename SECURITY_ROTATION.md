Signer rotation and emergency steps

If the old signer key (SIGNER_PRIVATE_KEY) is compromised, follow these steps immediately.

1. Secure the new private key

- The new private key (private) was generated locally. Do NOT commit it to git.
- Store it in a secret manager (Vercel/Netlify/Cloud provider secrets, HashiCorp Vault, etc.)
- In Vercel: set the `SIGNER_PRIVATE_KEY` environment variable to the new private key (0x...)

2. Update the contract `trustedSigner`

- The deployed contract exposes `setTrustedSigner(address)` (owner-only). The contract owner must call this method to replace the trusted signer address.
- Example ethers.js script (run locally, owner must have deployer private key):

```js
// scripts/rotate_trusted_signer.js
const { ethers } = require("ethers");

async function main() {
  const ownerPriv = process.env.OWNER_PRIVATE_KEY; // owner key (DO NOT COMMIT)
  const rpc = process.env.RPC_URL || "https://polygon-rpc.com";
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(ownerPriv, provider);

  const CONTRACT_ADDRESS =
    process.env.NEUTRAL_HEART_ADDRESS || "<contract_address_here>";
  const ABI = ["function setTrustedSigner(address) external"];

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
  const newSignerAddr = process.env.NEW_SIGNER_ADDRESS; // set to new address
  if (!newSignerAddr) throw new Error("NEW_SIGNER_ADDRESS not provided");

  console.log("Calling setTrustedSigner(", newSignerAddr, ")...");
  const tx = await contract.setTrustedSigner(newSignerAddr);
  console.log("tx.hash", tx.hash);
  await tx.wait();
  console.log("Trusted signer updated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- Usage:

```bash
export OWNER_PRIVATE_KEY="0x..."    # owner account that can call setTrustedSigner
export NEW_SIGNER_ADDRESS="0x541feb1F78347E08E36ebcDF27A23baC223f92B1"
export RPC_URL="https://polygon-rpc.com"
node scripts/rotate_trusted_signer.js
```

3. Replace server envs / secrets

- Once the contract owner has successfully updated the trusted signer on-chain, update the deployment environment (`SIGNER_PRIVATE_KEY`) to the new private key.
- Rotate any other related credentials (CI, deploy keys) if you suspect further compromise.

4. Revoke old keys and audit

- If the old signer key was stored in an unsecured place (repo, logs, CI), assume it is compromised. Remove it from all places.
- Audit logs to see when the old key was used and which signatures were produced. Check database entries created around the times of suspicious activity.

5. Optional: make the backend signature flow more restrictive

- Only sign for wallets that are tied to the authenticated user (do not accept arbitrary `wallet_address` in request body).
- Include a short nonce stored server-side in the signed payload to prevent replay and ensure single use.
- Add audit logs for each signature issuance.

6. Contact points

- If funds were stolen and transferred to centralized exchanges, collect tx hashes and open tickets with exchanges/law enforcement as needed.

---

Note: If you want, I can prepare the `scripts/rotate_trusted_signer.js` file and a hardened patch to `app/api/generate-signature/route.ts` to require authenticated wallet mapping + audit logging. Tell me to proceed and I will implement and run local checks.

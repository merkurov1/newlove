NFT helper scripts

1) Pinata uploader: scripts/pinata-upload.js
   - Usage:
     PINATA_JWT=your_jwt node scripts/pinata-upload.js --metadata metadata.json
     or
     PINATA_API_KEY=... PINATA_API_SECRET=... node scripts/pinata-upload.js --metadata metadata.json
   - metadata.json can be an object or an array of objects. Each object should follow ERC-721 metadata shape (name, description, image, attributes...).
   - The script prints ipfs hash and a gateway URL.

2) Generate signer key: scripts/generate_signer_key.sh
   - Usage: ./scripts/generate_signer_key.sh
   - Prints a 32-byte hex private key. DO NOT commit it.

3) Seed subscribers: scripts/seed_subscribers.js
   - Usage:
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed_subscribers.js subscribers.json
   - subscribers.json example:
     [ { "wallet_address": "0xabc...", "has_claimed": false }, ... ]
   - Script is idempotent: it skips addresses already present.

Notes:
- All scripts read credentials from env. They do not store secrets in the repo.
- If Pinata credentials are not available or pin fails, you can upload metadata manually and pass the resulting IPFS URL to the app config (NEXT_PUBLIC_NEUTRAL_HEART_BASEURI).

Deploying the contract (Hardhat)
--------------------------------
Use the provided Hardhat deploy helper to deploy `NeutralHeart` to Polygon (or any network configured in `hardhat.config.js`). The script uses env vars and is idempotent for baseURI/trustedSigner steps.

Example env vars to set locally (don't commit these):

```bash
export POLYGON_RPC_URL='https://polygon-rpc.com/'
export DEPLOY_PRIVATE_KEY='0x...'
export PRICE_MATIC='1.0'
export MAX_PUBLIC='1000'
export NEUTRAL_HEART_BASEURI='ipfs://<base-uri>/'
export TRUSTED_SIGNER_ADDRESS='0x...'
```

Run deploy:

```bash
npx hardhat run --network polygon scripts/deploy_hardhat.js
```

After deploy the script prints the deployed address. If `NEUTRAL_HEART_BASEURI` is provided it will call `setBaseURI`, and if `TRUSTED_SIGNER_ADDRESS` is set it will call `setTrustedSigner`.

If you need verification on Polygonscan, set `POLYGONSCAN_API_KEY` env and run the verify task.


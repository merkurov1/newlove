#!/usr/bin/env node
/*
Idempotent seed script for `subscribers` table.
Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed_subscribers.js subscribers.json
subscribers.json should be an array of objects like:
  [{ "wallet_address": "0x...", "has_claimed": false }, ...]
If no file provided, the script will insert a single example row (no-op if exists).
*/

import fs from 'fs';
import process from 'process';
import { createClient } from '@supabase/supabase-js';

async function main() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env');
        process.exit(2);
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const argv = process.argv.slice(2);
    let items = [];
    if (argv[0]) {
        const p = argv[0];
        if (!fs.existsSync(p)) {
            console.error('File not found:', p);
            process.exit(2);
        }
        items = JSON.parse(fs.readFileSync(p, 'utf8'));
    } else {
        items = [{ wallet_address: '0x0000000000000000000000000000000000000000', has_claimed: false }];
    }

    for (const it of items) {
        const addr = String(it.wallet_address || '').toLowerCase();
        if (!addr || addr.length < 10) continue;
        // check existing
        const { data } = await supabase.from('subscribers').select('id,wallet_address').ilike('wallet_address', addr).limit(1).maybeSingle();
        if (data) {
            console.log('Skipping existing', addr);
            continue;
        }
        const toInsert = { wallet_address: addr, has_claimed: !!it.has_claimed };
        const { error } = await supabase.from('subscribers').insert(toInsert);
        if (error) console.error('Insert error for', addr, error.message || error);
        else console.log('Inserted', addr);
    }
}

main().catch((e) => { console.error('Fatal', e); process.exit(1); });

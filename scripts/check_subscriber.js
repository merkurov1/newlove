#!/usr/bin/env node
/*
  Usage:
    SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/check_subscriber.js test@example.com

  Prints the subscriber row (if any) for the given email.
*/
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/check_subscriber.js <email>');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
    process.exit(2);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    const { data, error } = await supabase.from('subscribers').select('*').eq('email', email).maybeSingle();
    if (error) {
      console.error('Supabase error:', error);
      process.exit(3);
    }
    if (!data) {
      console.log('No subscriber found for', email);
      process.exit(0);
    }
    console.log('Subscriber row:');
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Unexpected error:', e);
    process.exit(4);
  }
}

main();

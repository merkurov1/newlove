import { createClient } from '@supabase/supabase-js';

(async function(){
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) {
      console.error('Missing SUPABASE env vars. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
      process.exit(2);
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const userId = 'fffa55a9-1ed7-49ff-953d-dfffa9f00844';
    const roleId = '3d82ded0-5652-488a-b377-20766f317520';

    console.log('Using Supabase URL:', url);
    console.log('Using service key: %s', key ? 'present' : 'missing');

    console.log('\n--- Query: roles by id ---');
    const r1 = await supabase.from('roles').select('*').eq('id', roleId).limit(1).maybeSingle();
    console.log('roles query error:', r1.error ? r1.error.message : null);
    console.log('roles row:', r1.data);

    console.log('\n--- Query: user_roles for user ---');
    const r2 = await supabase.from('user_roles').select('role_id, roles(name)').eq('user_id', userId);
    console.log('user_roles error:', r2.error ? r2.error.message : null);
    console.log('user_roles rows:', r2.data);

    console.log('\n--- Query: users table entry ---');
    const r3 = await supabase.from('users').select('id, email, role, user_metadata').eq('id', userId).limit(1).maybeSingle();
    console.log('users query error:', r3.error ? r3.error.message : null);
    console.log('users row:', r3.data);

    process.exit(0);
  } catch (e) {
    console.error('Script failed:', e);
    process.exit(1);
  }
})();

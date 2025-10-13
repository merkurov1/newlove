import users from './users_export.json' assert { type: 'json' };

let supabase;
try {
  const helper = await import('./supabase-client.js');
  supabase = helper.getScriptSupabase();
} catch (err) {
  console.error('Missing supabase env for import script. Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL');
  process.exit(1);
}

async function importUsers() {
  for (const user of users) {
    const role = user.role || "USER";
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: {
        name: user.name,
        legacy_id: user.id,
        image: user.image,
        username: user.username,
        bio: user.bio,
        website: user.website,
        role
      }
    });
    if (error) {
      console.error('Error creating user:', user.email, error.message);
      continue;
    }
    console.log('User created:', data.user.email, 'Supabase ID:', data.user.id);
  }
}

importUsers();

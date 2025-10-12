import { createClient } from '@supabase/supabase-js';
import users from './users_export.json' assert { type: 'json' };

const supabase = createClient('https://YOUR_PROJECT.supabase.co', 'YOUR_SERVICE_ROLE_KEY');

async function importUsers() {
  for (const user of users) {
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
        role: user.role
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

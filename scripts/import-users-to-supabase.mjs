import { createClient } from '@supabase/supabase-js';
import users from './users_export.json' assert { type: 'json' };

const supabase = createClient('https://txvkqcitalfbjytmnawq.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4dmtxY2l0YWxmYmp5dG1uYXdxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjEwOTY0NSwiZXhwIjoyMDcxNjg1NjQ1fQ.qyHk46Z9uwxGAUVJAD5gdujSntVkPHKsPbopyYvwvz8');

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

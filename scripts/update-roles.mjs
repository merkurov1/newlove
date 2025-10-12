import { createClient } from '@supabase/supabase-js';
import roles from './roles_update.json' assert { type: 'json' };

const supabase = createClient('https://txvkqcitalfbjytmnawq.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4dmtxY2l0YWxmYmp5dG1uYXdxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjEwOTY0NSwiZXhwIjoyMDcxNjg1NjQ1fQ.qyHk46Z9uwxGAUVJAD5gdujSntVkPHKsPbopyYvwvz8');

async function updateRoles() {
  for (const entry of roles) {
    // Получаем пользователя по email
    const { data, error } = await supabase.auth.admin.listUsers({ email: entry.email });
    if (error || !data?.users?.length) {
      console.error('User not found:', entry.email);
      continue;
    }
    const user = data.users[0];
    // Обновляем user_metadata с новой ролью
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: entry.role }
    });
    if (updateError) {
      console.error('Error updating role for:', entry.email, updateError.message);
    } else {
      console.log('Role updated for:', entry.email, '->', entry.role);
    }
  }
}

updateRoles();

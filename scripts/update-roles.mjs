import roles from './roles_update.json' assert { type: 'json' };

let supabase;
try {
  const helper = await import('./supabase-client.js');
  supabase = helper.getScriptSupabase();
} catch (err) {
  console.error('Missing supabase env for update-roles script. Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL');
  process.exit(1);
}

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

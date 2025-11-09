#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Нужны env переменные: SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  console.log('=== ПРОВЕРКА ПОДПИСЧИКОВ ===\n');
  
  try {
    // Get all subscribers
    const { data: all, error: allErr } = await supabase
      .from('subscribers')
      .select('id, email, isActive, createdAt')
      .order('createdAt', { ascending: false });
    
    if (allErr) {
      console.error('❌ Ошибка получения подписчиков:', allErr);
      process.exit(2);
    }
    
    if (!all || all.length === 0) {
      console.log('❌ В базе нет подписчиков');
      process.exit(0);
    }
    
    const active = all.filter(s => s.isActive);
    const inactive = all.filter(s => !s.isActive);
    
    console.log(`📊 Всего подписчиков: ${all.length}`);
    console.log(`✅ Активных (isActive=true): ${active.length}`);
    console.log(`❌ Неактивных (isActive=false): ${inactive.length}`);
    console.log('\n--- ВСЕ ПОДПИСЧИКИ ---\n');
    
    all.forEach((s, idx) => {
      const status = s.isActive ? '✅' : '❌';
      console.log(`${idx + 1}. ${status} ${s.email.padEnd(35)} (isActive=${s.isActive})`);
    });
    
    console.log('\n=== КОНЕЦ ===');
  } catch (e) {
    console.error('❌ Неожиданная ошибка:', e);
    process.exit(3);
  }
}

main();

(async () => {
  try {
    const mod = await import('../lib/getUserAndSupabaseForRequest.js');
    const res = await mod.getUserAndSupabaseForRequest(new Request('http://localhost'));
    console.log('OK', !!res.supabase, !!res.user);
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();

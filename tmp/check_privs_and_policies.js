const { Client } = require('pg');
(async()=>{
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    const tables = ['articles','projects','subscribers','Tag','_ArticleToTag','postcard_orders'];
    for (const t of tables) {
      console.log('\n--- TABLE:', t);
      const grants = await c.query("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = $1 ORDER BY grantee", [t]);
      console.log('grants:', JSON.stringify(grants.rows,null,2));
      const policies = await c.query("SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = $1", [t]);
      console.log('policies:', JSON.stringify(policies.rows,null,2));
    }
    await c.end();
  } catch (e) {
    console.error('ERROR:', e);
    try { await c.end(); } catch(_){}
    process.exit(1);
  }
})();

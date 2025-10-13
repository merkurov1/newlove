const { Client } = require('pg');
(async () => {
  const url = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('No PROD_DATABASE_URL or DATABASE_URL in environment');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('project','projects');");
    if (res.rows.length) {
      console.log('Found tables:', res.rows.map(r => r.tablename).join(', '));
    } else {
      console.log('No table named project or projects found in public schema');
    }
  } catch (e) {
    console.error('ERROR', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();

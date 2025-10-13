const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.PROD_DATABASE_URL });
  try {
    await c.connect();
    const r = await c.query("SELECT table_name, table_type FROM information_schema.views WHERE table_schema='public' AND table_name='project'");
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error('ERROR', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();

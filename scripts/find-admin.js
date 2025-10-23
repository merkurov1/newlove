#!/usr/bin/env node
const { Client } = require('pg');
require('dotenv').config();
(async ()=>{
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try{
    const res = await client.query('SELECT id, email, role FROM "User" WHERE email = $1 LIMIT 1', ['merkurov@gmail.com']);
    if(res.rows.length) console.log(res.rows[0].id);
    else{
      const any = await client.query('SELECT id, email, role FROM "User" LIMIT 1');
      if(any.rows.length) console.log(any.rows[0].id);
      else console.log('');
    }
  }catch(e){ console.error('ERR', e.message); process.exit(1);}finally{ await client.end(); }
})();

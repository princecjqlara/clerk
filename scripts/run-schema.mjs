import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use connection string with IPv6 address since DNS doesn't resolve to IPv4
const client = new pg.Client({
  connectionString: 'postgresql://postgres:demet5732595@[2406:da1c:f42:ae12:310:b9f6:53d7:4728]:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('Connecting to Supabase Postgres...');
  await client.connect();
  console.log('Connected!');

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Running schema...');
  await client.query(sql);
  console.log('Schema created successfully!');

  // Set admin role for admin@admin.com
  console.log('Setting admin role...');
  await client.query(`
    UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@admin.com'
  `);

  // Check
  const res = await client.query('SELECT * FROM public.profiles');
  console.log('Profiles:', res.rows);

  await client.end();
  console.log('Done!');
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

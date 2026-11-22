import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL is not set in backend/.env');
    console.log('Please provide a valid PostgreSQL connection string:');
    console.log('e.g. DATABASE_URL=postgresql://postgres.your-ref:[password]@aws-0-region.pooler.supabase.com:6543/postgres\n');
    process.exit(1);
  }

  console.log('🔄 Connecting to external database...');
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/20261122000000_initial_schema.sql');
    const seedPath = path.resolve(__dirname, '../../../supabase/seed.sql');

    console.log(`📄 Applying schema from: ${path.basename(migrationPath)}`);
    const schemaSql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(schemaSql);
    console.log('✅ Schema migration applied successfully.');

    console.log(`🌱 Applying seed data from: ${path.basename(seedPath)}`);
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await client.query(seedSql);
    console.log('✅ Demo seed data populated successfully.');

    console.log('\n🎉 External database is fully configured and ready for the Community Disaster Relief System!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

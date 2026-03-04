import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config();
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
if (!connectionString) {
    console.error("Missing SUPABASE_DB_URL or DATABASE_URL environment variable.");
    process.exit(1);
}

const client = new Client({ connectionString });

async function checkStatus() {
    try {
        await client.connect();
        const res = await client.query('SELECT version();');
        console.log("Supabase Database Status: UP AND RESPONDING!");
        console.log("Version Details:", res.rows[0].version);
    } catch (e) {
        console.error("Supabase Database Status: CONNECTION FAILED!");
        console.error(e.message);
    } finally {
        await client.end();
    }
}

checkStatus();

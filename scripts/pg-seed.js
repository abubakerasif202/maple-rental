import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

// This string was provided by the user earlier in the chat
const connectionString = "postgresql://postgres:abubakerasif202@db.soxbdujttijsqmwqanfj.supabase.co:5432/postgres";

const client = new Client({
    connectionString,
});

async function runSchema() {
    try {
        await client.connect();
        console.log("Connected to PostgreSQL using the provided connection string.");

        const sqlPath = path.join(process.cwd(), 'supabase-schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log("Executing supabase-schema.sql...");

        await client.query(sql);

        console.log("Schema applied completely successfully!");

        // Once schema is applied, call seed function to put in mock data
        console.log("Importing seed-data script...");
        const { execSync } = await import('child_process');
        execSync('node scripts/seed-data.js', { stdio: 'inherit' });

    } catch (err) {
        console.error("Error executing schema:", err);
    } finally {
        await client.end();
    }
}

runSchema();

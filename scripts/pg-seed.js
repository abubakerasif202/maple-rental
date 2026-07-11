import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
if (!connectionString) {
    console.error("Missing DATABASE_URL or SUPABASE_DB_URL environment variable.");
    process.exit(1);
}

const client = new Client({
    connectionString,
});

async function runSchema() {
    try {
        if (process.env.ALLOW_SCHEMA_RESET !== 'true') {
            console.error("Refusing to run destructive schema reset. Set ALLOW_SCHEMA_RESET=true to proceed.");
            process.exit(1);
        }

        await client.connect();
        console.log("Connected to PostgreSQL using the provided connection string.");

        const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '01_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log("Executing supabase/migrations/01_schema.sql...");

        await client.query(sql);

        console.log("Schema applied completely successfully!");

    } catch (err) {
        console.error("Error executing schema:", err);
    } finally {
        await client.end();
    }
}

runSchema();

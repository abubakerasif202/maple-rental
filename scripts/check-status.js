import pg from 'pg';

const { Client } = pg;
const connectionString = "postgresql://postgres:abubakerasif202@db.soxbdujttijsqmwqanfj.supabase.co:5432/postgres";

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

import 'dotenv/config';
import { db } from '../api/db/index.js';

async function checkSupabaseStatus() {
    console.log("Checking Supabase connection to:", process.env.SUPABASE_URL);
    try {
        const { data, error } = await db.from('cars').select('count', { count: 'exact', head: true });

        if (error) {
            console.error("Supabase Connection Failed:", error.message);
            process.exit(1);
        } else {
            console.log("Supabase Status: UP AND RESPONDING!");
            console.log(`Successfully connected. Cars table is reachable.`);
            process.exit(0);
        }
    } catch (err) {
        console.error("Error connecting to Supabase:", err);
        process.exit(1);
    }
}

checkSupabaseStatus();


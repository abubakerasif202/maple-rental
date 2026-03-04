import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedAdmin() {
    const adminEmail = process.argv[2] || process.env.ADMIN_EMAIL || '';
    const adminPass = process.argv[3] || process.env.ADMIN_PASSWORD || '';

    if (!adminEmail || !adminPass) {
        console.error("Usage: node scripts/seed-admin.js <adminEmail> <adminPassword>");
        console.error("Or set ADMIN_EMAIL and ADMIN_PASSWORD in environment.");
        process.exit(1);
    }

    console.log(`Creating Admin User: ${adminEmail}`);

    // Create user in Auth
    const { data: user, error } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPass,
        email_confirm: true,
    });

    if (error) {
        if (error.message.includes("User already registered")) {
            console.log("Admin user already registered!");
            process.exit(0);
        }
        console.error("Error creating user:", error);
        process.exit(1);
    }

    console.log("Admin account created successfully!", user);
    process.exit(0);
}

seedAdmin();

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

async function resetAdmin() {
    const adminEmail = process.argv[2] || process.env.ADMIN_EMAIL || '';
    const newPassword = process.argv[3] || process.env.ADMIN_PASSWORD || '';

    if (!adminEmail || !newPassword) {
        console.error("Usage: node scripts/reset-admin.js <adminEmail> <newPassword>");
        console.error("Or set ADMIN_EMAIL and ADMIN_PASSWORD in environment.");
        process.exit(1);
    }

    console.log("Fetching user...");
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error("Error listing users:", error);
        return;
    }

    const adminUser = users.find(u => u.email === adminEmail);

    if (!adminUser) {
        console.log("Admin user not found. Will try to create...");
        return;
    }

    console.log(`Found admin user: ${adminUser.id}, updating password...`);

    const { data, error: updateError } = await supabase.auth.admin.updateUserById(
        adminUser.id,
        { password: newPassword }
    );

    if (updateError) {
        console.error("Error updating user:", updateError);
        return;
    }

    console.log("Password reset successfully!");
}

resetAdmin();

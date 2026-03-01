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
    console.log("Fetching user...");
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error("Error listing users:", error);
        return;
    }

    const adminUser = users.find(u => u.email === 'admin@maplefleet.com');

    if (!adminUser) {
        console.log("Admin user not found. Will try to create...");
        return;
    }

    console.log(`Found admin user: ${adminUser.id}, updating password to admin123456...`);

    const { data, error: updateError } = await supabase.auth.admin.updateUserById(
        adminUser.id,
        { password: 'admin123456' }
    );

    if (updateError) {
        console.error("Error updating user:", updateError);
        return;
    }

    console.log("Password reset successfully!");
}

resetAdmin();

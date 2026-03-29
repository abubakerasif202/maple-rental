import { env } from '../config/env.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { supabaseAdmin } from '../lib/supabase.js';

const mapDriver = (driver) => ({
  ...driver,
  role: driver.role || (driver.email === env.ADMIN_EMAIL ? 'admin' : 'driver'),
});

export const getDriverById = async (driverId) => {
  const { data, error } = await supabaseAdmin.from('drivers').select('*').eq('id', driverId).maybeSingle();
  if (error) {
    throw error;
  }
  return data ? mapDriver(data) : null;
};

export const getDriverByEmail = async (email) => {
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .select('*')
    .ilike('email', email.trim())
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapDriver(data) : null;
};

export const getDriverByAuthUserId = async (authUserId) => {
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapDriver(data) : null;
};

export const createDriverAccount = async ({
  email,
  password,
  fullName,
  phone,
  licenseNumber,
}) => {
  const existingDriver = await getDriverByEmail(email);
  if (existingDriver) {
    throw badRequest('A driver account already exists for this email.');
  }

  const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      fullName,
      phone,
    },
  });

  if (authError || !authResult.user) {
    throw authError || badRequest('Failed to create the driver auth account.');
  }

  const { data: driver, error } = await supabaseAdmin
    .from('drivers')
    .insert({
      auth_user_id: authResult.user.id,
      email,
      full_name: fullName,
      phone,
      license_number: licenseNumber,
      role: email === env.ADMIN_EMAIL ? 'admin' : 'driver',
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(authResult.user.id);
    throw error;
  }

  return mapDriver(driver);
};

export const updateDriver = async (driverId, payload) => {
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .update(payload)
    .eq('id', driverId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapDriver(data);
};

export const requireDriver = async (driverId) => {
  const driver = await getDriverById(driverId);
  if (!driver) {
    throw notFound('Driver not found');
  }
  return driver;
};

export const getDriverDashboard = async (driverId) => {
  const driver = await requireDriver(driverId);

  const [{ data: applications }, { data: subscriptions }, { data: vehicles }, { data: notifications }] =
    await Promise.all([
      supabaseAdmin
        .from('applications')
        .select('*, vehicles(*)')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('subscriptions')
        .select('*, vehicles(*)')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('vehicles')
        .select('*')
        .eq('id', driver.current_vehicle_id || '00000000-0000-0000-0000-000000000000'),
      supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

  return {
    driver,
    applications: applications || [],
    subscriptions: subscriptions || [],
    currentVehicle: vehicles?.[0] || null,
    notifications: notifications || [],
  };
};

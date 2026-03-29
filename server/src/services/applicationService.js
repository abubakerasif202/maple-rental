import { generateContractForApplication, getLatestContractForApplication } from './contractService.js';
import { createDriverAccount, getDriverById, updateDriver } from './driverService.js';
import { sendApprovalNotification } from './notificationService.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const createApplication = async ({
  fullName,
  email,
  phone,
  password,
  licenseNumber,
  vehicleId,
  experienceYears,
  preferredStartDate,
  notes,
}) => {
  const { data: vehicle, error: vehicleError } = await supabaseAdmin
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .eq('status', 'available')
    .maybeSingle();

  if (vehicleError) {
    throw vehicleError;
  }

  if (!vehicle) {
    throw notFound('Selected vehicle is no longer available');
  }

  const driver = await createDriverAccount({
    email,
    password,
    fullName,
    phone,
    licenseNumber,
  });

  try {
    const { data: application, error } = await supabaseAdmin
      .from('applications')
      .insert({
        driver_id: driver.id,
        vehicle_id: vehicleId,
        experience_years: experienceYears,
        preferred_start_date: preferredStartDate,
        notes,
        status: 'pending',
      })
      .select('*, vehicles(*)')
      .single();

    if (error) {
      throw error;
    }

    return {
      driver,
      application,
    };
  } catch (error) {
    if (driver.auth_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(driver.auth_user_id);
    }

    throw error;
  }
};

export const getApplicationById = async (applicationId) => {
  const { data, error } = await supabaseAdmin
    .from('applications')
    .select('*, drivers(*), vehicles(*), contract:contracts!applications_contract_id_fkey(*)')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const approveApplication = async ({ applicationId, approvedBy }) => {
  const application = await getApplicationById(applicationId);
  if (!application) {
    throw notFound('Application not found');
  }

  if (application.status !== 'pending') {
    throw badRequest('Only pending applications can be approved');
  }

  const driver = await getDriverById(application.driver_id);
  if (!driver) {
    throw notFound('Application driver not found');
  }

  const vehicle = application.vehicles;
  if (!vehicle) {
    throw notFound('Application vehicle not found');
  }

  if (!['available', 'reserved'].includes(vehicle.status)) {
    throw badRequest('Vehicle is not available for approval');
  }

  const existingContract =
    application.contract || (await getLatestContractForApplication(application.id));
  const contract =
    existingContract ||
    (await generateContractForApplication({
      driver,
      application,
      vehicle,
    }));

  const [updatedApplication, updatedDriver, updatedVehicle] = await Promise.all([
    supabaseAdmin
      .from('applications')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approvedBy,
        contract_id: contract.id,
      })
      .eq('id', applicationId)
      .select('*')
      .single(),
    updateDriver(driver.id, {
      status: 'approved',
      current_vehicle_id: vehicle.id,
    }),
    supabaseAdmin
      .from('vehicles')
      .update({ status: 'reserved' })
      .eq('id', vehicle.id)
      .select('*')
      .single(),
  ]);

  if (updatedApplication.error) {
    throw updatedApplication.error;
  }
  if (updatedVehicle.error) {
    throw updatedVehicle.error;
  }

  await sendApprovalNotification({
    driver: updatedDriver,
    application: updatedApplication.data,
    vehicle: updatedVehicle.data,
    contractUrl: contract.signed_url,
  });

  return {
    application: updatedApplication.data,
    driver: updatedDriver,
    contract,
  };
};

export const rejectApplication = async ({ applicationId, reason }) => {
  const application = await getApplicationById(applicationId);
  if (!application) {
    throw notFound('Application not found');
  }

  const { data, error } = await supabaseAdmin
    .from('applications')
    .update({
      status: 'rejected',
      rejection_reason: reason,
    })
    .eq('id', applicationId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

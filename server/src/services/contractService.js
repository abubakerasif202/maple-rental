import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';
import { supabaseAdmin, createSignedStorageUrl } from '../lib/supabase.js';

const money = (value) => new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: env.STRIPE_PRICE_CURRENCY.toUpperCase(),
}).format(Number(value || 0));

export const resolveContractDownload = async (contract) => {
  if (!contract) {
    return null;
  }

  return {
    ...contract,
    signed_url: await createSignedStorageUrl(
      contract.storage_bucket || env.CONTRACTS_BUCKET,
      contract.storage_path,
    ),
  };
};

const renderPdfToBuffer = async ({ driver, vehicle, application }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(22).text('Maple Rentals Driver Contract', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Driver: ${driver.full_name}`);
    doc.text(`Email: ${driver.email}`);
    doc.text(`Phone: ${driver.phone || 'Not supplied'}`);
    doc.text(`Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
    doc.text(`Plate: ${vehicle.plate_number}`);
    doc.text(`Weekly rate: ${money(vehicle.weekly_rate)}`);
    doc.text(`Security bond: ${money(vehicle.bond_amount)}`);
    doc.text(`Preferred start date: ${application.preferred_start_date || 'TBD'}`);
    doc.moveDown();
    doc.text(
      'This contract confirms the approved Maple Rentals vehicle subscription. Billing is managed through Stripe and access to the assigned vehicle remains conditional on active subscription status and policy compliance.',
      { align: 'left' },
    );
    doc.moveDown();
    doc.text('Operational terms', { underline: true });
    doc.text('- Weekly rental fees are billed in advance.');
    doc.text('- Failed payments may suspend or disable the driver account.');
    doc.text('- Vehicles must be returned in a compliant operational condition.');
    doc.text('- Maple Rentals may cancel subscriptions for breach or repeated non-payment.');
    doc.moveDown();
    doc.text(`Issued at: ${new Date().toLocaleString('en-AU')}`);
    doc.end();
  });

export const generateContractForApplication = async ({ driver, application, vehicle }) => {
  const fileName = `${driver.full_name.replace(/\s+/g, '-').toLowerCase()}-${application.id}.pdf`;
  const storagePath = `contracts/${driver.id}/${fileName}`;
  const buffer = await renderPdfToBuffer({ driver, vehicle, application });

  const { error: uploadError } = await supabaseAdmin.storage
    .from(env.CONTRACTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      driver_id: driver.id,
      application_id: application.id,
      vehicle_id: vehicle.id,
      storage_bucket: env.CONTRACTS_BUCKET,
      storage_path: storagePath,
      file_name: fileName,
      status: 'issued',
      issued_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    ...contract,
    signed_url: await createSignedStorageUrl(env.CONTRACTS_BUCKET, storagePath),
  };
};

export const getLatestContractForApplication = async (applicationId) => {
  const { data, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return resolveContractDownload(data);
};

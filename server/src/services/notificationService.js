import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const smtpTransport =
  env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: Boolean(env.SMTP_SECURE),
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      })
    : null;

const recordNotification = async (payload) => {
  const { error } = await supabaseAdmin.from('notifications').insert(payload);
  if (error) {
    logger.error('Failed to record notification', error);
  }
};

const sendEmailMessage = async ({ to, subject, html, text }) => {
  if (resendClient) {
    await resendClient.emails.send({
      from: `Maple Rentals <${env.NOTIFY_FROM_EMAIL}>`,
      to,
      subject,
      html,
      text,
    });
    return { delivered: true, provider: 'resend' };
  }

  if (smtpTransport) {
    await smtpTransport.sendMail({
      from: `Maple Rentals <${env.NOTIFY_FROM_EMAIL}>`,
      to,
      subject,
      html,
      text,
    });
    return { delivered: true, provider: 'smtp' };
  }

  return { delivered: false, provider: 'none', reason: 'No email provider configured' };
};

export const sendEmailNotification = async ({
  driverId,
  applicationId = null,
  subscriptionId = null,
  to,
  subject,
  html,
  text,
  templateKey,
}) => {
  try {
    const result = await sendEmailMessage({ to, subject, html, text });
    await recordNotification({
      driver_id: driverId,
      application_id: applicationId,
      subscription_id: subscriptionId,
      channel: 'email',
      template_key: templateKey,
      subject,
      body: text,
      status: result.delivered ? 'sent' : 'queued',
      sent_at: result.delivered ? new Date().toISOString() : null,
      metadata: result,
    });
    return result;
  } catch (error) {
    await recordNotification({
      driver_id: driverId,
      application_id: applicationId,
      subscription_id: subscriptionId,
      channel: 'email',
      template_key: templateKey,
      subject,
      body: text,
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown email failure',
    });
    throw error;
  }
};

export const sendSmsStub = async ({
  driverId,
  applicationId = null,
  subscriptionId = null,
  phone,
  message,
  templateKey,
}) => {
  logger.info(`SMS stub -> ${phone}: ${message}`);
  await recordNotification({
    driver_id: driverId,
    application_id: applicationId,
    subscription_id: subscriptionId,
    channel: 'sms',
    template_key: templateKey,
    subject: env.SMS_FROM,
    body: message,
    status: 'sent',
    sent_at: new Date().toISOString(),
    metadata: { provider: 'stub' },
  });
};

export const sendApprovalNotification = async ({ driver, application, vehicle, contractUrl }) => {
  const subject = 'Your Maple Rentals application was approved';
  const text = `Hi ${driver.full_name}, your application for the ${vehicle.make} ${vehicle.model} has been approved. Review your contract in the dashboard and complete billing to activate the rental.`;
  const html = `
    <p>Hi ${driver.full_name},</p>
    <p>Your Maple Rentals application for the <strong>${vehicle.make} ${vehicle.model}</strong> has been approved.</p>
    <p>Your contract is ready${contractUrl ? `: <a href="${contractUrl}">View contract</a>` : ''}.</p>
    <p>Log in to the billing portal to complete subscription checkout.</p>
  `;

  await sendEmailNotification({
    driverId: driver.id,
    applicationId: application.id,
    to: driver.email,
    subject,
    html,
    text,
    templateKey: 'approval',
  });

  if (driver.phone) {
    await sendSmsStub({
      driverId: driver.id,
      applicationId: application.id,
      phone: driver.phone,
      message: text,
      templateKey: 'approval',
    });
  }
};

export const sendPaymentSuccessNotification = async ({ driver, payment, vehicle }) => {
  const subject = 'Payment received successfully';
  const text = `Hi ${driver.full_name}, we received your payment of ${payment.currency.toUpperCase()} ${payment.amount.toFixed(2)} for the ${vehicle.make} ${vehicle.model}. Your rental is active.`;
  const html = `
    <p>Hi ${driver.full_name},</p>
    <p>We received your payment of <strong>${payment.currency.toUpperCase()} ${payment.amount.toFixed(2)}</strong>.</p>
    <p>Your ${vehicle.make} ${vehicle.model} rental is now active.</p>
  `;

  await sendEmailNotification({
    driverId: driver.id,
    subscriptionId: payment.subscription_id,
    to: driver.email,
    subject,
    html,
    text,
    templateKey: 'payment_success',
  });

  if (driver.phone) {
    await sendSmsStub({
      driverId: driver.id,
      subscriptionId: payment.subscription_id,
      phone: driver.phone,
      message: text,
      templateKey: 'payment_success',
    });
  }
};

export const sendPaymentFailedNotification = async ({ driver, payment }) => {
  const subject = 'Payment failed';
  const text = `Hi ${driver.full_name}, your latest Maple Rentals payment failed. Update your payment method in the billing portal to avoid suspension.`;
  const html = `
    <p>Hi ${driver.full_name},</p>
    <p>Your latest Maple Rentals payment failed.</p>
    <p>Please update your payment method in the billing portal to avoid suspension.</p>
    <p>Failure details: ${payment.failure_message || 'Stripe did not provide more detail.'}</p>
  `;

  await sendEmailNotification({
    driverId: driver.id,
    subscriptionId: payment.subscription_id,
    to: driver.email,
    subject,
    html,
    text,
    templateKey: 'payment_failed',
  });

  if (driver.phone) {
    await sendSmsStub({
      driverId: driver.id,
      subscriptionId: payment.subscription_id,
      phone: driver.phone,
      message: text,
      templateKey: 'payment_failed',
    });
  }
};

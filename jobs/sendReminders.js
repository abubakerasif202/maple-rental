import 'dotenv/config';
import { logger } from '../server/src/lib/logger.js';
import { supabaseAdmin } from '../server/src/lib/supabase.js';
import {
  sendEmailNotification,
  sendSmsStub,
} from '../server/src/services/notificationService.js';
import { updateDriver } from '../server/src/services/driverService.js';

const withinThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
const nowIso = new Date().toISOString();

const sendRenewalReminders = async () => {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*, drivers(*)')
    .eq('status', 'active')
    .lte('current_period_end', withinThreeDays);

  if (error) {
    throw error;
  }

  for (const subscription of data || []) {
    const driver = subscription.drivers;
    if (!driver) {
      continue;
    }

    const body = `Hi ${driver.full_name}, your Maple Rentals billing period ends on ${subscription.current_period_end}. Review the billing portal if you need to update payment details.`;
    await sendEmailNotification({
      driverId: driver.id,
      subscriptionId: subscription.id,
      to: driver.email,
      subject: 'Upcoming billing renewal',
      html: `<p>${body}</p>`,
      text: body,
      templateKey: 'renewal_reminder',
    });

    if (driver.phone) {
      await sendSmsStub({
        driverId: driver.id,
        subscriptionId: subscription.id,
        phone: driver.phone,
        message: body,
        templateKey: 'renewal_reminder',
      });
    }
  }
};

const disableLongOverdueDrivers = async () => {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*, drivers(*)')
    .in('status', ['past_due', 'unpaid'])
    .lte('current_period_end', nowIso);

  if (error) {
    throw error;
  }

  let disabled = 0;
  for (const subscription of data || []) {
    const driver = subscription.drivers;
    if (!driver || driver.status === 'disabled') {
      continue;
    }

    await updateDriver(driver.id, { status: 'disabled', current_vehicle_id: null });
    await Promise.all([
      supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', subscription.vehicle_id),
      supabaseAdmin.from('subscriptions').update({ status: 'unpaid' }).eq('id', subscription.id),
    ]);
    disabled += 1;
  }

  return disabled;
};

const run = async () => {
  await sendRenewalReminders();
  const disabled = await disableLongOverdueDrivers();
  logger.info('sendReminders completed', { disabled });
};

run().catch((error) => {
  logger.error('sendReminders failed', error);
  process.exit(1);
});

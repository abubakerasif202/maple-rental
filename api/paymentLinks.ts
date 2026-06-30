import { escapeHtml, sendResendEmail } from './email.js';

const DEFAULT_APP_URL = 'http://localhost:3000';

const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

export const appendCheckoutTokenHash = (url: URL, token: string) => {
  url.hash = new URLSearchParams({ checkout_token: token }).toString();
  return url;
};

export const getAppBaseUrl = () => {
  const configuredUrl = (process.env.APP_URL || process.env.FRONTEND_URL || '').trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL is required in production for secure payment links.');
  }

  return DEFAULT_APP_URL;
};

export const buildDriverPaymentLink = ({
  applicationId,
  token,
}: {
  applicationId: string;
  token: string;
}) => {
  const checkoutUrl = new URL(`/checkout/${applicationId}`, getAppBaseUrl());
  return appendCheckoutTokenHash(checkoutUrl, token).toString();
};

export const sendDriverPaymentLinkEmail = async ({
  applicantEmail,
  applicantName,
  approvedBond,
  bondPaymentMethod,
  bondPaymentStatus,
  approvedWeeklyPrice,
  approvedVehicle,
  checkoutUrl,
}: {
  applicantEmail: string;
  applicantName: string;
  approvedBond: number;
  bondPaymentMethod?: string | null;
  bondPaymentStatus?: string | null;
  approvedWeeklyPrice: number;
  approvedVehicle: string;
  checkoutUrl: string;
}) => {
  if (!process.env.RESEND_API_KEY) {
    return {
      delivered: false,
      reason: 'RESEND_API_KEY is not configured.',
    };
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const safeApplicantName = escapeHtml(applicantName);
  const safeApprovedVehicle = escapeHtml(approvedVehicle);
  const safeCheckoutUrl = escapeHtml(checkoutUrl);
  const bondStatusLabel =
    bondPaymentStatus === 'cash_paid'
      ? 'Paid cash'
      : bondPaymentStatus === 'already_paid'
        ? 'Already paid / existing driver'
        : 'To be collected by admin';
  const bondMethodLabel =
    bondPaymentMethod === 'cash'
      ? 'Cash'
      : bondPaymentMethod === 'existing_paid'
        ? 'Existing paid'
        : 'Not yet collected';

  try {
    await sendResendEmail(resend, {
      from: 'Gala Rentals <noreply@galarentals.com.au>',
      to: applicantEmail,
      subject: 'Your Gala Rentals checkout link is ready',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c;">
          <h2 style="color: #D4AF37;">Application Ready For Checkout</h2>
          <p>Hi ${safeApplicantName},</p>
          <p>Your application review is complete and your secure checkout link is now ready.</p>
          <p><strong>Approved vehicle:</strong> ${safeApprovedVehicle}</p>
          <p><strong>Stripe weekly charge:</strong> ${formatCurrency(approvedWeeklyPrice)} per week</p>
          <p><strong>Bond:</strong> ${formatCurrency(approvedBond)} manual / not charged by Stripe</p>
          <p><strong>Bond status:</strong> ${escapeHtml(bondStatusLabel)}</p>
          <p><strong>Bond method:</strong> ${escapeHtml(bondMethodLabel)}</p>
          <p>Bond is handled manually by Maple Rentals and is not charged through Stripe.</p>
          <p>Stripe will only charge the approved weekly rental subscription amount.</p>
          <p>Once Stripe confirms payment, Gala Rentals finalises onboarding and handover with you directly.</p>
          <p>
            <a
              href="${safeCheckoutUrl}"
              style="display:inline-block;padding:14px 22px;background:#D4AF37;color:#111827;text-decoration:none;font-weight:700;border-radius:8px;"
            >
              Open secure payment link
            </a>
          </p>
          <p>This link is time-limited for security. If it expires, reply to this email and we will issue a fresh one.</p>
          <p>Best regards,<br /><strong>The Gala Rentals Team</strong></p>
        </div>
      `,
    });
  } catch (error) {
    return {
      delivered: false,
      reason: error instanceof Error ? error.message : 'Email delivery failed.',
    };
  }

  return {
    delivered: true,
    reason: null,
  };
};

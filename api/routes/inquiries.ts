import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { inquirySchema } from '../../shared/inquiry.js';
import { escapeHtml, getResend, sanitizeEmailHeaderValue, sendResendEmail } from '../email.js';

const router = express.Router();
const SUPPORT_FALLBACK_MESSAGE =
  'Availability inquiries are temporarily unavailable online. Please call or email Gala Rentals directly.';
const inquirySubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many inquiries submitted. Please try again later.' },
  skip: () => process.env.VITEST === 'true',
});

router.post('/', inquirySubmissionLimiter, async (req, res) => {
  try {
    const inquiry = inquirySchema.parse(req.body ?? {});

    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: SUPPORT_FALLBACK_MESSAGE });
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'hello@galarentals.com.au';
    const resend = await getResend();
    const safeName = escapeHtml(inquiry.name);
    const safeEmail = escapeHtml(inquiry.email);
    const safePhone = escapeHtml(inquiry.phone);
    const safeStartDate = escapeHtml(inquiry.startDate);
    const safeEndDate = escapeHtml(inquiry.endDate);
    const safeMessage = escapeHtml(inquiry.message || 'No additional notes provided.');
    const inquiryNameForSubject = sanitizeEmailHeaderValue(inquiry.name);

    const [adminEmailResult, userEmailResult] = await Promise.allSettled([
      sendResendEmail(resend, {
        from: 'Gala Rentals <noreply@galarentals.com.au>',
        to: adminEmail,
        subject: `New availability inquiry from ${inquiryNameForSubject}`,
        html: `
          <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #1a202c;">
            <h2 style="color: #D4AF37;">New Availability Inquiry</h2>
            <p><strong>Name:</strong> ${safeName}</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p><strong>Phone:</strong> ${safePhone}</p>
            <p><strong>Requested dates:</strong> ${safeStartDate} to ${safeEndDate}</p>
            <p><strong>Additional notes:</strong></p>
            <p>${safeMessage}</p>
          </div>
        `,
      }),
      sendResendEmail(resend, {
        from: 'Gala Rentals <noreply@galarentals.com.au>',
        to: inquiry.email,
        subject: 'We received your Gala Rentals enquiry',
        html: `
          <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #1a202c;">
            <h2 style="color: #D4AF37;">Inquiry Received</h2>
            <p>Hi ${safeName},</p>
            <p>We received your availability inquiry for ${safeStartDate} to ${safeEndDate}.</p>
            <p>Our fleet manager will review current availability and contact you shortly.</p>
            <p>Best regards,<br /><strong>The Gala Rentals Team</strong></p>
          </div>
        `,
      }),
    ]);

    if (adminEmailResult.status === 'rejected') {
      throw adminEmailResult.reason;
    }

    if (userEmailResult.status === 'rejected') {
      console.warn('Failed to send inquiry confirmation to user:', userEmailResult.reason);
    }

    res.status(202).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }

    console.error('Inquiry submission error:', error);
    res.status(500).json({ error: 'Failed to submit availability inquiry' });
  }
});

export default router;

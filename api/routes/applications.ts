import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from './auth.js';
import { applicationSchema, applicationStatusEnum } from '../validation.js';
import { z } from 'zod';
import crypto from 'crypto';

const router = express.Router();

router.get('/', authenticateAdmin, async (_req, res) => {
  const { data, error } = await db.from('applications').select('*').order('created_at', { ascending: false });
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch applications' });
  }
  res.json(data || []);
});

router.post('/', async (req, res) => {
  try {
    const data = applicationSchema.parse(req.body);
    let licensePhotoUrl = null;
    let uberScreenshotUrl = null;

    const uploadImage = async (base64Str: string, filePrefix: string) => {
      const match = base64Str.match(/^data:([a-zA-Z0-9-+/=.]+);base64,(.+)$/);
      if (!match) return null;

      const [, contentType, base64Data] = match;
      
      // Basic validation of content type
      if (!contentType.startsWith('image/')) {
        console.error(`Invalid content type for ${filePrefix}: ${contentType}`);
        return null;
      }

      const buffer = Buffer.from(base64Data, 'base64');
      
      // Check size (e.g., 10MB limit)
      if (buffer.length > 10 * 1024 * 1024) {
        console.error(`File too large for ${filePrefix}: ${buffer.length} bytes`);
        return null;
      }

      const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${filePrefix}`;

      const { data: uploadData, error: uploadError } = await db.storage
        .from('applications')
        .upload(filename, buffer, { contentType });

      if (uploadError) {
        console.error(`Error uploading ${filePrefix}:`, uploadError);
        return null;
      }

      const { data: publicUrlData } = db.storage.from('applications').getPublicUrl(filename);
      return publicUrlData.publicUrl;
    };

    if (data.license_photo) {
      if (!data.license_photo.startsWith('data:')) {
        return res.status(400).json({ error: 'License photo must be a valid image data URL' });
      }
      licensePhotoUrl = await uploadImage(data.license_photo, 'license');
      if (!licensePhotoUrl) {
        return res.status(500).json({ error: 'Failed to upload license photo' });
      }
    }

    if (data.uber_screenshot) {
      if (!data.uber_screenshot.startsWith('data:')) {
        return res.status(400).json({ error: 'Uber screenshot must be a valid image data URL' });
      }
      uberScreenshotUrl = await uploadImage(data.uber_screenshot, 'uber');
      if (!uberScreenshotUrl) {
        return res.status(500).json({ error: 'Failed to upload uber screenshot' });
      }
    }

    const { data: inserted, error } = await db.from('applications').insert([
      {
        ...data,
        license_photo: licensePhotoUrl,
        uber_screenshot: uberScreenshotUrl,
      }
    ]).select('id').single();

    if (error) throw error;

    // Send Confirmation Emails via Resend
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@maplerentals.com.au';

        // Email to the Applicant
        await resend.emails.send({
          from: 'Maple Rentals <noreply@maplerentals.com.au>',
          to: data.email,
          subject: 'Application Received - Maple Rentals',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c;">
              <h2 style="color: #D4AF37;">Application Received</h2>
              <p>Hi ${data.name},</p>
              <p>Thank you for applying to rent a Toyota Camry Hybrid with Maple Rentals.</p>
              <p>We have successfully received your application, including your license and Uber details. Our team will review your application and try to get back to you within 24 hours.</p>
              <p>If you have any urgent questions, please contact us directly.</p>
              <br>
              <p>Best regards,</p>
              <p><strong>The Maple Rentals Team</strong></p>
            </div>
          `
        });

        // Email to the Admin
        await resend.emails.send({
          from: 'Maple Rentals Notifications <noreply@maplerentals.com.au>',
          to: adminEmail,
          subject: `New Driver Application: ${data.name}`,
          html: `
            <div style="font-family: sans-serif; color: #1a202c;">
              <h2>New Driver Application</h2>
              <p>A new driver application has been submitted:</p>
              <ul>
                <li><strong>Name:</strong> ${data.name}</li>
                <li><strong>Phone:</strong> ${data.phone}</li>
                <li><strong>Email:</strong> ${data.email}</li>
                <li><strong>Address:</strong> ${data.address}</li>
                <li><strong>Uber Status:</strong> ${data.uber_status}</li>
                <li><strong>Experience:</strong> ${data.experience}</li>
                <li><strong>Intended Start:</strong> ${data.intended_start_date}</li>
              </ul>
              <p>Please log in to the admin dashboard to review their documents and approve/deny the application.</p>
            </div>
          `
        });
        console.log(`Confirmation emails sent successfully for applicant: ${data.email}`);
      } catch (emailError) {
        console.error("Failed to send Resend emails:", emailError);
      }
    }

    res.json({ success: true, application_id: String(inserted.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    console.error('Application submission error:', err);
    res.status(500).json({ error: 'Application submission failed' });
  }
});

router.put('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = z.object({ status: applicationStatusEnum }).parse(req.body ?? {});
    const { error } = await db.from('applications').update({ status }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('Application update error:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

export default router;

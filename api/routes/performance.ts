import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

const metricSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('lcp'), value: z.number().finite().min(0).max(120_000) }).strict(),
  z.object({ name: z.literal('cls'), value: z.number().finite().min(0).max(10) }).strict(),
  z.object({ name: z.literal('ttfb'), value: z.number().finite().min(0).max(120_000) }).strict(),
]);

const performanceReportSchema = z.object({
  route: z.enum(['home', 'pricing', 'apply', 'checkout', 'admin', 'other']),
  metrics: z.array(metricSchema).min(1).max(3),
}).strict();

const router = express.Router();

router.post(
  '/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many performance reports.',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.VITEST === 'true',
  }),
  express.json({ limit: '4kb' }),
  (req, res) => {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.VITEST !== 'true' &&
      req.get('sec-fetch-site') !== 'same-origin'
    ) {
      res.status(403).json({ error: 'Cross-site performance reports are not accepted' });
      return;
    }

    const parsed = performanceReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid performance report' });
      return;
    }

    console.info(JSON.stringify({
      event: 'web_vitals_untrusted',
      requestId: String(res.locals.requestId || '-'),
      route: parsed.data.route,
      metrics: parsed.data.metrics.map((metric) => ({
        name: metric.name,
        value: Number(metric.value.toFixed(metric.name === 'cls' ? 4 : 1)),
      })),
    }));

    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
  }
);

export default router;

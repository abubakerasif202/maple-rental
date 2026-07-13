import express from 'express';
import { db } from '../db/index.js';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  isMissingOperationalHistoryTableError,
  OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
} from '../operationalHistory.js';

const router = express.Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const parsePositiveInt = (value: unknown, fallback: number) => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const normalizeSearchTerm = (value: unknown) => {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (typeof normalized !== 'string') {
    return '';
  }

  return normalized.replace(/[^a-zA-Z0-9@.+\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

router.get('/', authenticateAdmin, async (req, res) => {
  const requestedPage = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const searchTerm = normalizeSearchTerm(req.query.search);

  try {
    const { data, error } = await db.rpc('list_current_customer_invoice_summaries', {
      p_page: requestedPage,
      p_page_size: pageSize,
      p_search: searchTerm,
    });

    if (error) {
      if (isMissingOperationalHistoryTableError(error)) {
        return res.json({
          available: false,
          items: [],
          message: OPERATIONAL_HISTORY_UNAVAILABLE_MESSAGE,
          page: 1,
          pageSize,
          totalItems: 0,
          totalPages: 1,
        });
      }

      throw error;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Customer summary transaction returned an invalid response.');
    }

    res.json({
      available: true,
      ...(data as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Customer history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch customer history' });
  }
});

export default router;

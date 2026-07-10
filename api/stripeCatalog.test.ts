import Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { inspectStripeCatalog } from './stripeCatalog.js';

const weeklyProduct = {
  id: 'prod_weekly',
  active: true,
  description: 'Recurring weekly rental subscription.',
  metadata: {
    maple_rental_app: 'maple-rental',
    maple_rental_catalog_kind: 'weekly_rental',
  },
  name: 'Weekly vehicle rental',
} as unknown as Stripe.Product;

const createStripe = (products: Stripe.Product[]) => {
  const list = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      for (const product of products) {
        yield product;
      }
    },
  }));
  const create = vi.fn();
  const update = vi.fn();

  return {
    stripe: { products: { create, list, update } } as unknown as Stripe,
    create,
    list,
    update,
  };
};

describe('inspectStripeCatalog', () => {
  afterEach(() => {
    delete process.env.STRIPE_WEEKLY_RENTAL_PRODUCT_ID;
  });

  it('inspects the live weekly catalog without mutating Stripe', async () => {
    const { stripe, create, list, update } = createStripe([weeklyProduct]);

    await expect(inspectStripeCatalog(stripe)).resolves.toEqual({
      weeklyRental: { productId: 'prod_weekly', source: 'existing' },
    });
    expect(list).toHaveBeenCalledWith({ active: true, limit: 100 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('fails handoff inspection when the weekly product is missing', async () => {
    const { stripe, create, update } = createStripe([]);

    await expect(inspectStripeCatalog(stripe)).rejects.toThrow(
      'Stripe catalog is missing the active Weekly vehicle rental product'
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('uses an explicitly configured weekly product without calling Stripe', async () => {
    process.env.STRIPE_WEEKLY_RENTAL_PRODUCT_ID = 'prod_configured';
    const { stripe, create, list, update } = createStripe([]);

    await expect(inspectStripeCatalog(stripe)).resolves.toEqual({
      weeklyRental: { productId: 'prod_configured', source: 'env' },
    });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

import './load-env.js';

import { STRIPE_API_VERSION } from '../api/constants.js';
import { clearStripeCatalogCache, ensureStripeCatalog } from '../api/stripeCatalog.js';
import { createStripeClient, requireStripeSecretKey } from '../api/stripeClient.js';

type ResetMode = 'apply' | 'dry_run';

type ResetSummary = {
  attempted: number;
  failed: number;
  succeeded: number;
};

const args = new Set(process.argv.slice(2));
const mode: ResetMode = args.has('--apply') ? 'apply' : 'dry_run';
const reseedCatalog = args.has('--reseed-catalog');
const stripeSecretKey = requireStripeSecretKey();

if (!stripeSecretKey.startsWith('sk_test_')) {
  throw new Error('Refusing to reset Stripe data with a non-test key.');
}

if (mode === 'apply' && process.env.ALLOW_STRIPE_RESET !== 'true') {
  throw new Error(
    'Set ALLOW_STRIPE_RESET=true to run a destructive Stripe reset in apply mode.'
  );
}

const stripe = createStripeClient(stripeSecretKey);
const cancelablePaymentIntentStatuses = new Set([
  'processing',
  'requires_action',
  'requires_capture',
  'requires_confirmation',
  'requires_payment_method',
]);

const collectAll = async <T>(listPromise: AsyncIterable<T>) => {
  const items: T[] = [];

  for await (const item of listPromise) {
    items.push(item);
  }

  return items;
};

const summary: ResetSummary = {
  attempted: 0,
  failed: 0,
  succeeded: 0,
};

const run = async (
  label: string,
  action: () => Promise<unknown>,
  options: { alreadyDone?: boolean } = {}
) => {
  summary.attempted += 1;

  if (options.alreadyDone) {
    summary.succeeded += 1;
    console.log(`[skip] ${label}`);
    return;
  }

  if (mode === 'dry_run') {
    summary.succeeded += 1;
    console.log(`[dry-run] ${label}`);
    return;
  }

  try {
    await action();
    summary.succeeded += 1;
    console.log(`[done] ${label}`);
  } catch (error) {
    summary.failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[failed] ${label}: ${message}`);
  }
};

const account = await stripe.accounts.retrieveCurrent();

console.log(
  JSON.stringify(
    {
      accountId: account.id,
      apiVersion: STRIPE_API_VERSION,
      keyMode: 'test',
      mode,
      reseedCatalog,
    },
    null,
    2
  )
);

const [checkoutSessions, paymentLinks, subscriptions, paymentIntents, invoices, prices, products] =
  await Promise.all([
    collectAll(stripe.checkout.sessions.list({ limit: 100 })),
    collectAll(stripe.paymentLinks.list({ active: true, limit: 100 })),
    collectAll(stripe.subscriptions.list({ limit: 100, status: 'all' })),
    collectAll(stripe.paymentIntents.list({ limit: 100 })),
    collectAll(stripe.invoices.list({ limit: 100 })),
    collectAll(stripe.prices.list({ limit: 100 })),
    collectAll(stripe.products.list({ limit: 100 })),
  ]);

const customers = await collectAll(stripe.customers.list({ limit: 100 }));

for (const session of checkoutSessions) {
  await run(
    `expire checkout session ${session.id}`,
    () => stripe.checkout.sessions.expire(session.id),
    {
      alreadyDone: session.status !== 'open',
    }
  );
}

for (const paymentLink of paymentLinks) {
  await run(`deactivate payment link ${paymentLink.id}`, () =>
    stripe.paymentLinks.update(paymentLink.id, { active: false })
  );
}

for (const subscription of subscriptions) {
  await run(
    `cancel subscription ${subscription.id}`,
    () => stripe.subscriptions.cancel(subscription.id),
    {
      alreadyDone: subscription.status === 'canceled',
    }
  );
}

for (const paymentIntent of paymentIntents) {
  await run(
    `cancel payment intent ${paymentIntent.id}`,
    () => stripe.paymentIntents.cancel(paymentIntent.id),
    {
      alreadyDone: !cancelablePaymentIntentStatuses.has(paymentIntent.status),
    }
  );
}

for (const invoice of invoices) {
  if (invoice.status === 'draft') {
    await run(`delete draft invoice ${invoice.id}`, () => stripe.invoices.del(invoice.id));
    continue;
  }

  if (invoice.status === 'open' || invoice.status === 'uncollectible') {
    await run(`void invoice ${invoice.id}`, () => stripe.invoices.voidInvoice(invoice.id));
    continue;
  }

  await run(`leave invoice ${invoice.id} (${invoice.status})`, async () => undefined, {
    alreadyDone: true,
  });
}

for (const customer of customers) {
  await run(`delete customer ${customer.id}`, () => stripe.customers.del(customer.id));
}

for (const price of prices) {
  await run(
    `archive price ${price.id}`,
    () => stripe.prices.update(price.id, { active: false }),
    {
      alreadyDone: !price.active,
    }
  );
}

for (const product of products) {
  const productHasPrices = prices.some((price) => {
    const priceProductId = typeof price.product === 'string' ? price.product : price.product.id;
    return priceProductId === product.id;
  });

  if (!productHasPrices) {
    await run(`delete product ${product.id}`, () => stripe.products.del(product.id));
    continue;
  }

  await run(
    `archive product ${product.id}`,
    () => stripe.products.update(product.id, { active: false }),
    {
      alreadyDone: !product.active,
    }
  );
}

let catalog: Awaited<ReturnType<typeof ensureStripeCatalog>> | null = null;

if (reseedCatalog) {
  clearStripeCatalogCache();
  catalog = await ensureStripeCatalog(stripe);
}

console.log(
  JSON.stringify(
    {
      accountId: account.id,
      apiVersion: STRIPE_API_VERSION,
      catalog,
      summary,
    },
    null,
    2
  )
);

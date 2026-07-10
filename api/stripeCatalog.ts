import Stripe from 'stripe';

import {
  buildStripeCatalogMetadata,
  STRIPE_CATALOG_APP_METADATA_KEY,
  STRIPE_CATALOG_APP_METADATA_VALUE,
  STRIPE_CATALOG_KIND_METADATA_KEY,
  stripeCatalogEntries,
  type StripeCatalogProductDefinition,
  type StripeCatalogProductKey,
} from '../shared/stripeCatalog.js';

export type ResolvedStripeCatalog = Record<
  StripeCatalogProductKey,
  {
    productId: string;
    source: 'created' | 'env' | 'existing';
  }
>;

let cachedStripeCatalogPromise: Promise<ResolvedStripeCatalog> | null = null;

const readEnvCatalog = (): ResolvedStripeCatalog | null => {
  const entries = stripeCatalogEntries.map(([key, definition]) => {
    const productId = process.env[definition.envVar]?.trim();
    return productId
      ? [key, { productId, source: 'env' as const }]
      : null;
  });

  if (entries.some((entry) => entry === null)) {
    return null;
  }

  return Object.fromEntries(entries) as ResolvedStripeCatalog;
};

const matchesCatalogDefinition = (
  product: Stripe.Product,
  definition: StripeCatalogProductDefinition
) =>
  product.metadata?.[STRIPE_CATALOG_APP_METADATA_KEY] ===
    STRIPE_CATALOG_APP_METADATA_VALUE &&
  product.metadata?.[STRIPE_CATALOG_KIND_METADATA_KEY] === definition.kind;

const syncCatalogProduct = async (
  stripe: Stripe,
  product: Stripe.Product,
  definition: StripeCatalogProductDefinition
) => {
  const metadata = buildStripeCatalogMetadata(definition.kind);
  const shouldUpdate =
    product.name !== definition.name ||
    (product.description || '') !== definition.description ||
    product.metadata?.[STRIPE_CATALOG_APP_METADATA_KEY] !==
      STRIPE_CATALOG_APP_METADATA_VALUE ||
    product.metadata?.[STRIPE_CATALOG_KIND_METADATA_KEY] !== definition.kind;

  if (!shouldUpdate) {
    return product;
  }

  return stripe.products.update(product.id, {
    description: definition.description,
    metadata,
    name: definition.name,
  });
};

const ensureCatalogFromStripe = async (stripe: Stripe): Promise<ResolvedStripeCatalog> => {
  const activeProducts: Stripe.Product[] = [];

  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    activeProducts.push(product);
  }

  const resolvedEntries = await Promise.all(
    stripeCatalogEntries.map(async ([key, definition]) => {
      const existingProduct = activeProducts.find((product) =>
        matchesCatalogDefinition(product, definition)
      );

      if (existingProduct) {
        const syncedProduct = await syncCatalogProduct(stripe, existingProduct, definition);
        return [key, { productId: syncedProduct.id, source: 'existing' as const }];
      }

      const createdProduct = await stripe.products.create({
        description: definition.description,
        metadata: buildStripeCatalogMetadata(definition.kind),
        name: definition.name,
      });

      return [key, { productId: createdProduct.id, source: 'created' as const }];
    })
  );

  return Object.fromEntries(resolvedEntries) as ResolvedStripeCatalog;
};

export const inspectStripeCatalog = async (
  stripe: Stripe
): Promise<ResolvedStripeCatalog> => {
  const envCatalog = readEnvCatalog();
  if (envCatalog) {
    return envCatalog;
  }

  const activeProducts: Stripe.Product[] = [];
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    activeProducts.push(product);
  }

  const entries = stripeCatalogEntries.map(([key, definition]) => {
    const product = activeProducts.find((candidate) =>
      matchesCatalogDefinition(candidate, definition)
    );

    if (!product) {
      throw new Error(
        `Stripe catalog is missing the active ${definition.name} product. Run npm run stripe:setup in a controlled environment before handoff.`
      );
    }

    return [key, { productId: product.id, source: 'existing' as const }];
  });

  return Object.fromEntries(entries) as ResolvedStripeCatalog;
};

export const ensureStripeCatalog = async (stripe: Stripe): Promise<ResolvedStripeCatalog> => {
  const envCatalog = readEnvCatalog();
  if (envCatalog) {
    return envCatalog;
  }

  if (!cachedStripeCatalogPromise) {
    cachedStripeCatalogPromise = ensureCatalogFromStripe(stripe).catch((error) => {
      cachedStripeCatalogPromise = null;
      throw error;
    });
  }

  return cachedStripeCatalogPromise;
};

export const clearStripeCatalogCache = () => {
  cachedStripeCatalogPromise = null;
};

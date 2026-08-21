import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const publicRoutes = ['/', '/pricing', '/apply'] as const;
const deliveredMetadata = {
  '/': 'Premium Driver Car Rentals Sydney | Maple Rentals',
  '/apply': 'Apply to Drive with Maple Rentals | Sydney Car Rental Applications',
  '/pricing': 'Car Rental Plans Sydney | Uber Rental Options | Maple Rentals',
} as const;

const collectPageFailures = (page: Page) => {
  const failures: string[] = [];
  page.on('pageerror', (error: Error) => failures.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const resourceType = response.request().resourceType();
    if (['document', 'script', 'stylesheet', 'image', 'font'].includes(resourceType) && response.status() >= 400) {
      failures.push(`${response.status()} ${resourceType}: ${response.url()}`);
    }
  });
  return failures;
};

for (const route of publicRoutes) {
  test(`${route} has no overflow, runtime errors, resource failures, or serious axe violations`, async ({ page }) => {
    const failures = collectPageFailures(page);
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(failures).toEqual([]);

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test('delivered HTML contains route-specific title, canonical, description, and Open Graph metadata', async ({ request }) => {
  for (const [route, title] of Object.entries(deliveredMetadata)) {
    const response = await request.get(route, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    const canonical = `https://www.maplerentals.com.au${route === '/' ? '/' : route}`;
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain('<meta name="description" content="');
    expect(html).toContain(`<link rel="canonical" href="${canonical}" />`);
    expect(html).toContain(`<meta property="og:title" content="${title}" />`);
    expect(html).toContain(`<meta property="og:url" content="${canonical}" />`);
  }
});

test('primary navigation and main CTA reach the intended public routes', async ({ page }) => {
  await page.goto('/');
  if ((page.viewportSize()?.width || 0) < 768) {
    const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
    await menuButton.click();
    await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Mobile navigation' }).getByRole('link', { name: 'Pricing' }).click();
  } else {
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Pricing' }).click();
  }
  await expect(page).toHaveURL(/\/pricing$/);

  await page.goto('/');
  await page.getByRole('link', { name: /^Apply Now$/i }).click();
  await expect(page).toHaveURL(/\/apply$/);
});

test('application form exposes associated labels and keyboard-reachable controls', async ({ page }) => {
  await page.goto('/apply');
  const fullName = page.getByLabel('Full name');
  const phone = page.getByLabel('Mobile number');
  const email = page.getByLabel('Email address');
  await expect(fullName).toBeVisible();
  await expect(phone).toBeVisible();
  await expect(email).toBeVisible();

  await page.locator('body').press('Tab');
  for (let index = 0; index < 12 && await fullName.evaluate((element) => document.activeElement !== element); index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(fullName).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(phone).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(email).toBeFocused();
});

test('unknown navigation returns HTTP 404 and renders the not-found page', async ({ page }) => {
  const response = await page.goto('/definitely-not-a-maple-route');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /does not exist/i })).toBeVisible();
});

test('admin routes preserve authentication and redirect an anonymous user to login', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: 'Admin Access' })).toBeVisible();
  await expect(page.getByLabel('Admin Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

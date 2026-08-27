import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('licence upload keyboard accessibility', () => {
  const applySource = readSource('src/pages/Apply.tsx');

  it('keeps both licence file inputs out of display:none', () => {
    expect(applySource).not.toContain('className="hidden"');
    expect(applySource).toContain('id="application-licence-front"');
    expect(applySource).toContain('id="application-licence-back"');
  });

  it('uses a visually-hidden-but-focusable strategy for licence inputs', () => {
    const frontBlock = applySource.slice(
      applySource.indexOf('id="application-licence-front"'),
      applySource.indexOf('id="application-licence-front"') + 700,
    );
    const backBlock = applySource.slice(
      applySource.indexOf('id="application-licence-back"'),
      applySource.indexOf('id="application-licence-back"') + 700,
    );

    expect(frontBlock).toContain('className="sr-only"');
    expect(backBlock).toContain('className="sr-only"');
  });

  it('gives each licence input a distinct accessible name', () => {
    expect(applySource).toContain('aria-label="Driver licence front photo"');
    expect(applySource).toContain('aria-label="Driver licence back photo"');
  });

  it('surfaces focus on the wrapping upload target', () => {
    const focusWithinCount = applySource.split('focus-within:ring-2').length - 1;
    expect(focusWithinCount).toBeGreaterThanOrEqual(2);
  });

  it('keeps the agreement scroll region keyboard reachable and named', () => {
    expect(applySource).toContain('aria-labelledby="application-agreement-label"');
    expect(applySource).toContain('id="application-agreement-label"');
    expect(applySource).toContain('role="region"');
  });
});

describe('inquiry form submit state', () => {
  const inquirySource = readSource('src/components/InquiryForm.tsx');

  it('keeps an accessible name on the submit button while submitting', () => {
    expect(inquirySource).toContain('aria-busy={isSubmitting}');
    expect(inquirySource).toContain(
      "{isSubmitting ? 'Submitting Inquiry' : 'Submit Inquiry'}",
    );
  });

  it('hides the submitting spinner from assistive technology', () => {
    expect(inquirySource).toContain('aria-hidden="true"');
    expect(inquirySource).not.toContain(
      '<div className="w-5 h-5 border-2 border-brand-navy border-t-transparent rounded-full animate-spin">',
    );
  });

  it('moves focus to the success heading after submission', () => {
    expect(inquirySource).toContain('successHeadingRef.current?.focus()');
    expect(inquirySource).toContain('ref={successHeadingRef}');
    expect(inquirySource).toContain('tabIndex={-1}');
  });

  it('no longer uses the failing white/20 placeholder token', () => {
    expect(inquirySource).not.toContain('placeholder:text-white/20');
    expect(inquirySource).toContain('placeholder:text-brand-grey');
  });
});

describe('identify input purpose', () => {
  it('declares autocomplete on public contact fields', () => {
    const inquirySource = readSource('src/components/InquiryForm.tsx');

    expect(inquirySource).toContain('autoComplete="name"');
    expect(inquirySource).toContain('autoComplete="email"');
    expect(inquirySource).toContain('autoComplete="tel"');
  });

  it('declares autocomplete on application identity fields', () => {
    const applySource = readSource('src/pages/Apply.tsx');

    expect(applySource).toContain('autoComplete="name"');
    expect(applySource).toContain('autoComplete="email"');
    expect(applySource).toContain('autoComplete="tel"');
    expect(applySource).toContain('autoComplete="street-address"');
  });

  it('declares credential autocomplete on admin login', () => {
    const loginSource = readSource('src/pages/AdminLogin.tsx');

    expect(loginSource).toContain('autoComplete="username"');
    expect(loginSource).toContain('autoComplete="current-password"');
  });
});

describe('admin login labelling', () => {
  const loginSource = readSource('src/pages/AdminLogin.tsx');

  it('shows persistent visible labels rather than placeholder-only labelling', () => {
    expect(loginSource).not.toContain('className="sr-only">Admin Email');
    expect(loginSource).not.toContain('className="sr-only">Password');
    expect(loginSource).toContain('htmlFor="admin-email"');
    expect(loginSource).toContain('htmlFor="admin-password"');
    expect(loginSource).toContain('>\n                Admin Email\n              </label>');
  });

  it('announces login failures and uses a contrast-safe error token', () => {
    expect(loginSource).toContain('<div role="alert"');
    expect(loginSource).toContain('text-red-300');
    expect(loginSource).not.toContain('text-red-500 text-xs text-center');
  });
});

describe('async status messages', () => {
  it('announces pricing loading and error states', () => {
    const pricingSource = readSource('src/pages/Pricing.tsx');

    expect(pricingSource).toContain('role="status"');
    expect(pricingSource).toContain('role="alert"');
  });

  it('announces checkout loading and error states', () => {
    const checkoutSource = readSource('src/pages/Checkout.tsx');

    expect(checkoutSource).toContain('role="status"');
    expect(checkoutSource).toContain('role="alert"');
  });

  it('announces payment status transitions exactly once on the success page', () => {
    const successSource = readSource('src/pages/Success.tsx');

    expect(successSource).toContain("presentation.tone === 'failure' ? 'alert' : 'status'");
    expect(successSource).toContain('aria-atomic="true"');
    expect(successSource.split('aria-live=').length - 1).toBe(1);
  });

  it('announces agreement template loading on the application form', () => {
    const applySource = readSource('src/pages/Apply.tsx');

    expect(applySource).toContain('<div role="status" aria-live="polite" className="flex items-center gap-3 text-brand-grey">');
  });
});

describe('semantic heading structure', () => {
  const headingTags = (source: string) =>
    (source.match(/<(?:motion\.)?h[1-6][\s>]/g) ?? []).map((tag) =>
      tag.replace('motion.', '').slice(1, 3),
    );

  it('gives the success page a primary heading', () => {
    const tags = headingTags(readSource('src/pages/Success.tsx'));

    expect(tags).toContain('h1');
    expect(tags).not.toContain('h2');
  });

  it('does not skip a level in the checkout sidebar', () => {
    const tags = new Set(headingTags(readSource('src/pages/Checkout.tsx')));

    expect(tags.has('h1')).toBe(true);
    expect(tags.has('h2')).toBe(true);
    expect(tags.has('h4')).toBe(false);
  });

  it('keeps home card headings below a section heading', () => {
    const homeSource = readSource('src/pages/Home.tsx');

    expect(homeSource).toContain('<h2 className="sr-only">Application and payment safeguards</h2>');
    expect(homeSource).toContain('<h3 className="text-2xl font-serif font-bold text-white">{item.title}</h3>');
  });
});

describe('decorative icons and chart alternatives', () => {
  it('hides decorative icons across the public pages', () => {
    for (const file of [
      'src/pages/Home.tsx',
      'src/pages/Pricing.tsx',
      'src/pages/Apply.tsx',
      'src/pages/Checkout.tsx',
      'src/pages/Success.tsx',
      'src/components/Navbar.tsx',
      'src/components/Footer.tsx',
      'src/components/InquiryForm.tsx',
    ]) {
      expect(readSource(file)).toContain('aria-hidden="true"');
    }
  });

  it('describes admin charts from real data rather than a generic label', () => {
    const chartSource = readSource('src/components/admin/OverviewCharts.tsx');

    expect(chartSource).toContain('role="img"');
    expect(chartSource).toContain('describeRevenueTrend');
    expect(chartSource).toContain('describeStatusDistribution');
    expect(chartSource).not.toContain('aria-label="chart"');
  });
});

describe('mobile navigation background', () => {
  const navbarSource = readSource('src/components/Navbar.tsx');

  it('inerts the background while the dialog is open and restores it on close', () => {
    expect(navbarSource).toContain("region.setAttribute('inert', '')");
    expect(navbarSource).toContain("region.removeAttribute('inert')");
  });

  it('preserves the existing focus trap and restoration', () => {
    expect(navbarSource).toContain("event.key === 'Escape'");
    expect(navbarSource).toContain('mobileToggleRef.current?.focus()');
  });
});

describe('contrast tokens', () => {
  it('removes the failing footer legal-text tokens', () => {
    const footerSource = readSource('src/components/Footer.tsx');

    expect(footerSource).not.toContain('text-slate-600');
    expect(footerSource).not.toContain('text-gray-600');
    expect(footerSource).toContain('ABDeveloperCredit');
    expect(footerSource).toContain('<ABDeveloperCredit />');
  });

  it('includes the premium AB Digital Solutions credit asset and link', () => {
    const creditSource = readSource('src/components/ABDeveloperCredit.tsx');

    expect(creditSource).toContain('Designed &amp; Developed by');
    expect(creditSource).toContain('https://www.abwebstudio.com.au/');
    expect(creditSource).toContain('/branding/ab-digital-solutions-watermark.png');
    expect(creditSource).toContain('alt="AB Digital Solutions"');
  });

  it('removes the failing pricing eyebrow and error tokens', () => {
    const pricingSource = readSource('src/pages/Pricing.tsx');

    expect(pricingSource).not.toContain('text-red-500');
    expect(pricingSource).not.toContain("'text-brand-gold' : 'text-slate-400'");
  });

  it('raises interactive field borders above the 3:1 non-text threshold', () => {
    const applySource = readSource('src/pages/Apply.tsx');

    expect(applySource).toContain('border-white/40 bg-brand-navy');
    expect(applySource).not.toContain('border-white/10 bg-brand-navy px-5');
  });
});

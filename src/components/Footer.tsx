import { Link } from '../lib/router';
import { ArrowUpRight, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';

const quickLinks = [
  { label: 'Home', path: '/' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Apply', path: '/apply' },
  { label: 'Admin Login', path: '/admin/login' },
];

export default function Footer() {
  return (
    <footer id="contact" className="border-t border-white/10 bg-brand-charcoal text-slate-400">
      <div className="maple-container py-16 sm:py-20">
        <div className="mb-16 grid gap-8 rounded-[2rem] border border-brand-gold/20 bg-[radial-gradient(circle_at_top_right,rgba(223,177,37,0.15),transparent_35%),rgba(255,255,255,0.035)] p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="maple-eyebrow">Ready when you are</p>
            <h2 className="mt-4 max-w-2xl font-serif text-3xl font-bold leading-tight text-white sm:text-4xl">
              Start with an application. Pay only after review and approval.
            </h2>
          </div>
          <Link to="/apply" className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-7 py-4 text-xs font-extrabold uppercase tracking-[0.2em] text-brand-charcoal transition hover:-translate-y-0.5 hover:bg-brand-gold-light">
            Apply for a rental <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.2fr_0.7fr_1fr] lg:gap-16">
          <div>
            <Link to="/" aria-label="Maple Rentals home" className="flex items-center mb-8 group">
              <img
                src="/maple-logo-256.webp"
                alt="Maple Rentals Sydney car rentals logo"
                decoding="async"
                height={256}
                loading="lazy"
                width={256}
                className="h-20 md:h-24 object-contain rounded-lg"
              />
            </Link>
            <p className="max-w-sm text-sm font-light leading-7 text-slate-400">
              Structured weekly vehicle rentals for professional drivers across Greater Sydney,
              with admin-reviewed applications and secure Stripe payments.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-brand-gold" /> Secure approval-first process
            </div>
            <p className="mt-5 max-w-sm text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Service areas: Merrylands, Parramatta, Lidcombe, and Greater Sydney
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Rental Links</h3>
            <ul className="space-y-5">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="inline-flex min-h-6 items-center py-1.5 text-sm hover:text-brand-gold transition-colors font-light">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Contact Us</h3>
            <ul className="space-y-5">
              <li className="flex items-center gap-4">
                <Phone aria-hidden="true" className="h-4 w-4 text-brand-gold" />
                <a href="tel:0420550556" className="inline-flex min-h-6 items-center py-1.5 text-sm hover:text-brand-gold transition-colors font-light tracking-wider">0420 550 556</a>
              </li>
              <li className="flex items-center gap-4">
                <Mail aria-hidden="true" className="h-4 w-4 text-brand-gold" />
                <a href="mailto:admin@maplerentals.com.au" className="inline-flex min-h-6 items-center py-1.5 text-sm hover:text-brand-gold transition-colors font-light">admin@maplerentals.com.au</a>
              </li>
              <li className="flex items-start gap-4">
                <MapPin aria-hidden="true" className="h-4 w-4 text-brand-gold mt-0.5" />
                <span className="text-sm font-light leading-relaxed">
                  13/27-33 Addlestone Rd
                  <br />
                  Merrylands NSW 2160
                </span>
              </li>
              <li className="text-xs text-slate-400 mt-8 space-y-2 font-light">
                <p>Sarfaraz Rajabi</p>
                <p>Licence No: 317786C</p>
                <p>ABN No: 16623061941</p>
                <p>ACN No: 623061941</p>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-white/10 pt-7 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Maple Rentals. All rights reserved.</p>
          <p>Driver rentals · Merrylands · Greater Sydney</p>
        </div>
      </div>
    </footer>
  );
}

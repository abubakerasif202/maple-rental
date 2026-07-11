import { ArrowLeft, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';

export default function NotFound() {
  return (
    <section className="maple-container flex min-h-[70vh] items-center py-20">
      <Seo
        title="Page Not Found | Maple Rentals"
        description="The requested Maple Rentals page could not be found."
        robots="noindex,nofollow"
      />
      <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl sm:p-14">
        <p className="maple-eyebrow">404 · Page not found</p>
        <FileText className="mx-auto mt-8 h-12 w-12 text-brand-gold" aria-hidden="true" />
        <h1 className="mt-6 font-serif text-4xl font-bold text-white sm:text-5xl">
          This page has moved or does not exist.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-brand-grey">
          Return to the Maple Rentals home page or begin a rental application.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-7 text-xs font-bold uppercase tracking-widest text-white">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <Link to="/apply" className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-gold px-7 text-xs font-extrabold uppercase tracking-widest text-brand-charcoal">
            Start application
          </Link>
        </div>
      </div>
    </section>
  );
}

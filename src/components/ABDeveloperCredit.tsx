import { ArrowUpRight } from 'lucide-react';

export default function ABDeveloperCredit() {
  return (
    <div className="mt-7 border-t border-white/10 pt-6 sm:mt-8 sm:pt-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
          Designed &amp; Developed by
        </p>

        <a
          href="https://www.abwebstudio.com.au/"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Visit AB Digital Solutions"
          className="group inline-flex items-center gap-3 self-start rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 transition duration-200 hover:-translate-y-0.5 hover:border-brand-gold/30 hover:bg-white/[0.05] focus-visible:ring-offset-brand-charcoal"
        >
          <img
            src="/branding/ab-digital-solutions-watermark.png"
            alt="AB Digital Solutions"
            decoding="async"
            loading="lazy"
            width={1020}
            height={500}
            className="h-10 w-auto max-w-[11.5rem] object-contain sm:h-11 sm:max-w-[13rem]"
          />
          <ArrowUpRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-brand-gold transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </a>
      </div>
    </div>
  );
}

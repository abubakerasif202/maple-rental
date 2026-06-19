import { Mail, MapPin, Phone, Clock3, Send } from 'lucide-react';
import Seo from '../components/Seo';
import { submitInquiry } from '../lib/api';
import { useState, type FormEvent } from 'react';

export default function Contact() {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');

    const formData = new FormData(event.currentTarget);
    try {
      await submitInquiry({
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        startDate: String(formData.get('startDate') || '').trim(),
        endDate: String(formData.get('endDate') || '').trim(),
        message: String(formData.get('message') || '').trim(),
      });
      setMessage('');
      setStatus('sent');
      event.currentTarget.reset();
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-brand-navy text-white">
      <Seo
        title="Contact | Gala Rentals"
        description="Contact Gala Rentals for fleet availability, rental questions, or application support."
        canonicalPath="/contact"
      />

      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">Contact</p>
            <h1 className="mt-5 text-5xl font-serif font-bold tracking-tight sm:text-6xl">
              Reach the team directly.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-stone-300">
              Gala Rentals keeps enquiries simple: ask about fleet availability,
              rental terms, start dates, or application support.
            </p>

            <div className="mt-10 space-y-4">
              {[
                { icon: Phone, title: 'Phone', body: '1300 555 828' },
                { icon: Mail, title: 'Email', body: 'hello@galarentals.com.au' },
                { icon: Clock3, title: 'Business hours', body: 'Mon-Fri, 8:30am to 5:30pm AEST' },
                { icon: MapPin, title: 'Service area', body: 'Sydney metro and surrounding suburbs' },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gold/10 text-brand-gold">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-gold">{item.title}</p>
                    <p className="text-sm text-white">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-brand-gold">Message</p>
            <h2 className="mt-4 text-3xl font-semibold text-white">Send an enquiry</h2>

            <div className="mt-8 grid gap-4">
              <input name="name" required placeholder="Your name" className="rounded-2xl border border-white/10 bg-brand-navy px-5 py-4 text-white outline-none placeholder:text-brand-grey/60 focus:border-brand-gold" />
              <input name="email" type="email" required placeholder="Email address" className="rounded-2xl border border-white/10 bg-brand-navy px-5 py-4 text-white outline-none placeholder:text-brand-grey/60 focus:border-brand-gold" />
              <input name="phone" required placeholder="Phone number" className="rounded-2xl border border-white/10 bg-brand-navy px-5 py-4 text-white outline-none placeholder:text-brand-grey/60 focus:border-brand-gold" />
              <div className="grid gap-4 sm:grid-cols-2">
                <input name="startDate" type="date" required className="rounded-2xl border border-white/10 bg-brand-navy px-5 py-4 text-white outline-none focus:border-brand-gold" />
                <input name="endDate" type="date" required className="rounded-2xl border border-white/10 bg-brand-navy px-5 py-4 text-white outline-none focus:border-brand-gold" />
              </div>
              <textarea
                name="message"
                required
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                placeholder="Tell us what you need help with"
                className="rounded-2xl border border-white/10 bg-brand-navy px-5 py-4 text-white outline-none placeholder:text-brand-grey/60 focus:border-brand-gold"
              />
            </div>

            {status === 'sent' && (
              <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
                Your message has been sent.
              </div>
            )}
            {status === 'error' && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-50">
                We could not send your enquiry. Please try again.
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold px-7 py-4 text-xs font-bold uppercase tracking-[0.24em] text-brand-navy transition-colors hover:bg-brand-gold-light disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {status === 'sending' ? 'Sending' : 'Send enquiry'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

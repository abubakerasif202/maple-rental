import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Calendar,
  Gauge,
  Shield,
  ChevronRight,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Info,
} from 'lucide-react';
import Seo from '../components/Seo';
import { fetchCar } from '../lib/api';
import type { Car } from '../types';

export default function CarDetails() {
  const { id } = useParams();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCar = async () => {
      if (!id) return;
      try {
        const data = await fetchCar(id);
        setCar(data);
      } catch {
        setError('Failed to load vehicle details.');
      } finally {
        setLoading(false);
      }
    };
    void loadCar();
  }, [id]);

  const pageSeo = (
    <Seo
      title={
        car
          ? `${car.name} Car Rental Sydney | Gala Rentals`
          : 'Fleet Vehicle Details Sydney | Gala Rentals'
      }
      description={
        car
          ? `Review Gala Rentals vehicle details and application requirements for the ${car.name} available for Sydney drivers.`
          : 'Review Gala Rentals vehicle details and application-ready fleet information for Sydney drivers.'
      }
      canonicalPath={id ? `/cars/${id}` : '/cars'}
      keywords={
        car
          ? [
              `${car.name.toLowerCase()} car rental sydney`,
              `${car.name.toLowerCase()} uber rental`,
              'uber-ready car rental sydney',
            ]
          : ['fleet vehicle details sydney', 'uber car rental sydney']
      }
    />
  );

  if (loading) {
    return (
      <>
        {pageSeo}
        <div className="min-h-screen bg-brand-navy flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-brand-gold animate-spin" />
        </div>
      </>
    );
  }

  if (error || !car) {
    return (
      <>
        {pageSeo}
        <div className="min-h-screen bg-brand-navy flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-red-500 font-bold uppercase tracking-widest mb-6">
              {error || 'Vehicle not found'}
            </p>
            <Link
              to="/cars"
              className="text-brand-gold hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Fleet
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {pageSeo}
      <div className="pt-32 pb-24 min-h-screen bg-brand-navy">
        <div className="container mx-auto px-6">
          <Link
            to="/cars"
            className="inline-flex items-center gap-2 text-brand-grey hover:text-brand-gold transition-colors mb-12 uppercase tracking-widest text-[10px] font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Fleet
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-16">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl"
            >
              <span className={`inline-block px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border mb-6 ${
                car.status === 'Available'
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
              }`}>
                {car.status}
              </span>

              <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 uppercase tracking-tighter leading-none">
                {car.name}
              </h1>
              <p className="text-base sm:text-lg leading-8 text-brand-grey">
                Gala Rentals keeps public vehicle pricing, number plates, and final handover
                details private until your application is reviewed and approved.
              </p>

              <div className="grid grid-cols-3 gap-6 mt-10">
                {[
                  { icon: Calendar, label: 'Model Year', value: car.model_year },
                  { icon: Gauge, label: 'Transmission', value: 'Automatic' },
                  { icon: Shield, label: 'Insurance', value: 'Included' },
                ].map((spec, index) => (
                  <div
                    key={index}
                    className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center"
                  >
                    <spec.icon className="w-6 h-6 text-brand-gold mx-auto mb-3" />
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">
                      {spec.label}
                    </p>
                    <p className="text-sm font-bold text-white">{spec.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-3xl border border-brand-gold/20 bg-brand-gold/10 p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-brand-gold">
                  Approval note
                </p>
                <p className="mt-3 text-sm leading-7 text-brand-grey">
                  Once approved, Gala Rentals confirms the selected vehicle, registration details,
                  and the payment handoff directly with you.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-12"
            >
              <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">
                <h2 className="text-white font-bold uppercase tracking-widest text-xs mb-6 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-gold" /> Included Features
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    'Full maintenance and servicing',
                    'Comprehensive rideshare insurance',
                    '24/7 roadside assistance',
                    'Unlimited kilometres',
                    'Rego and CTP insurance',
                    'Tyres and brake replacement',
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3 text-brand-grey text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-gold/50" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-brand-gold/10 border border-brand-gold/20 p-8 rounded-2xl">
                <div className="flex gap-4">
                  <div className="bg-brand-gold text-brand-navy p-3 rounded-xl h-fit">
                    <Info className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-2">
                      Driver Requirements
                    </h3>
                    <ul className="text-brand-grey text-sm space-y-2">
                      <li>• Valid Australian driver&apos;s license</li>
                      <li>• Clean driving record for the last 3 years</li>
                      <li>• Proof of address and identity</li>
                      <li>• Approved Uber or rideshare account</li>
                      <li>• Payment handoff completed after approval</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Link
                to="/apply"
                className={`flex items-center justify-center gap-3 w-full py-6 font-bold text-sm transition-all uppercase tracking-widest shadow-2xl ${
                  car.status === 'Available'
                    ? 'bg-brand-gold hover:bg-brand-gold-light text-brand-navy'
                    : 'bg-white/5 text-brand-grey/40 cursor-not-allowed border border-white/10'
                }`}
                onClick={(event) => car.status !== 'Available' && event.preventDefault()}
              >
                {car.status === 'Available' ? (
                  <>
                    Apply for Approval
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : 'Currently Rented'}
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}

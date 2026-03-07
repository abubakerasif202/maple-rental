import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Calendar, Gauge, Shield, ChevronRight, CheckCircle2, ArrowLeft, Loader2, Info } from 'lucide-react';
import { fetchCar } from '../lib/api';
import { Car } from '../types';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

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
      } catch (err) {
        setError('Failed to load vehicle details.');
      } finally {
        setLoading(false);
      }
    };
    loadCar();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand-gold animate-spin" />
      </div>
    );
  }

  if (error || !car) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-500 font-bold uppercase tracking-widest mb-6">{error || 'Vehicle not found'}</p>
          <Link to="/cars" className="text-brand-gold hover:text-white transition-colors flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Fleet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 min-h-screen bg-brand-navy">
      <div className="container mx-auto px-6">
        <Link 
          to="/cars" 
          className="inline-flex items-center gap-2 text-brand-grey hover:text-brand-gold transition-colors mb-12 uppercase tracking-widest text-[10px] font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Fleet
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="aspect-[16/10] rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative group">
              <img 
                src={car.image} 
                alt={car.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>

            <div className="grid grid-cols-3 gap-6 mt-8">
              {[
                { icon: Calendar, label: 'Model Year', value: car.model_year },
                { icon: Gauge, label: 'Transmission', value: 'Automatic' },
                { icon: Shield, label: 'Insurance', value: 'Included' },
              ].map((spec, i) => (
                <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl text-center">
                  <spec.icon className="w-6 h-6 text-brand-gold mx-auto mb-3" />
                  <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">{spec.label}</p>
                  <p className="text-sm font-bold text-white">{spec.value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-8">
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
              <div className="flex items-baseline gap-2">
                <p className="text-5xl font-bold text-brand-gold">${car.weekly_price}</p>
                <p className="text-brand-grey uppercase tracking-widest text-xs">/ Per Week</p>
              </div>
            </div>

            <div className="space-y-12">
              <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">
                <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-6 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-gold" /> Included Features
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    'Full Maintenance & Servicing',
                    'Comprehensive Rideshare Insurance',
                    '24/7 Roadside Assistance',
                    'Unlimited Kilometres',
                    'Rego & CTP Insurance',
                    'Tyres & Brake Replacement'
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-3 text-brand-grey text-sm">
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
                    <h4 className="text-white font-bold uppercase tracking-widest text-xs mb-2">Driver Requirements</h4>
                    <ul className="text-brand-grey text-sm space-y-2">
                      <li>• Valid Australian Driver's License</li>
                      <li>• Clean driving record (last 3 years)</li>
                      <li>• Proof of address & identity</li>
                      <li>• Approved Uber/Rideshare account</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Link 
                to={`/apply?carId=${car.id}`}
                className={`flex items-center justify-center gap-3 w-full py-6 font-bold text-sm transition-all uppercase tracking-widest shadow-2xl ${
                  car.status === 'Available' 
                    ? 'bg-brand-gold hover:bg-brand-gold-light text-brand-navy' 
                    : 'bg-white/5 text-brand-grey/40 cursor-not-allowed border border-white/10'
                }`}
                onClick={(e) => car.status !== 'Available' && e.preventDefault()}
              >
                {car.status === 'Available' ? (
                  <>
                    Start Application
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : 'Currently Rented'}
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchCar } from '../lib/api';
import { Calendar, ShieldCheck, Droplets, ArrowLeft, CheckCircle, Car as CarIcon, ChevronRight, Info, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import type { Car } from '../types';

export default function CarDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchCar(id)
      .then(data => setCar(data))
      .catch(err => {
        console.error(err);
        setError('The vehicle details could not be retrieved.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-32 bg-brand-charcoal min-h-screen"><div className="w-12 h-12 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div></div>;
  
  if (error || !car) return (
    <div className="bg-brand-charcoal min-h-screen py-32 text-center flex flex-col items-center px-4">
      <AlertCircle className="w-16 h-16 text-red-500/50 mb-6" />
      <h2 className="text-3xl font-serif font-bold text-white mb-4">Vehicle Not Found</h2>
      <p className="text-brand-grey font-light mb-12 max-w-md">{error || "We couldn't find the vehicle you're looking for."}</p>
      <Link to="/cars" className="bg-brand-gold text-brand-charcoal px-10 py-4 font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors">
        Return to Fleet
      </Link>
    </div>
  );

  return (
    <div className="bg-brand-charcoal min-h-screen py-24 text-white selection:bg-brand-gold selection:text-brand-charcoal">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center text-brand-grey hover:text-brand-gold font-bold mb-12 transition-colors uppercase tracking-[0.2em] text-[10px]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Fleet
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Car Image & Gallery */}
          <div className="lg:col-span-7 space-y-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-brand-charcoal border border-white/5 overflow-hidden relative group"
            >
              <div className="relative h-[500px] overflow-hidden">
                <img 
                  src={car.image} 
                  alt={car.name} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-charcoal via-transparent to-transparent opacity-60"></div>
                <div className="absolute bottom-8 left-8">
                  <div className="inline-block bg-brand-gold text-brand-charcoal text-[10px] font-bold px-4 py-1.5 uppercase tracking-widest mb-4">
                    Toyota Hybrid Fleet
                  </div>
                  <h1 className="text-4xl md:text-5xl font-serif font-bold text-white leading-tight tracking-tight">{car.name}</h1>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-brand-charcoal border border-white/5 overflow-hidden">
                  <img 
                    src={car.image} 
                    alt="" 
                    className="w-full h-full object-cover opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Car Info & CTA */}
          <div className="lg:col-span-5">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-brand-charcoal border border-white/5 p-10 lg:p-12 sticky top-32"
            >
              <div className="flex justify-between items-end mb-10 pb-10 border-b border-white/5">
                <div>
                  <p className="text-brand-grey text-[10px] font-bold uppercase tracking-widest mb-2">Weekly Rate</p>
                  <p className="text-5xl font-bold text-brand-gold">${car.weeklyPrice}</p>
                </div>
                <div className="text-right">
                  <p className="text-brand-grey text-[10px] font-bold uppercase tracking-widest mb-2">Bond</p>
                  <p className="text-2xl font-bold text-white">${car.bond}</p>
                </div>
              </div>

              <div className="space-y-8 mb-12">
                <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
                  <Info className="w-4 h-4 text-brand-gold" /> Vehicle Specifications
                </h3>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Model Year</p>
                    <p className="text-sm font-bold text-white">{car.modelYear}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Fuel Type</p>
                    <p className="text-sm font-bold text-white">Hybrid Electric</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Transmission</p>
                    <p className="text-sm font-bold text-white">Automatic (CVT)</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Compliance</p>
                    <p className="text-sm font-bold text-white">Uber Ready</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 mb-12">
                <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em]">Included Services</h3>
                <ul className="space-y-4">
                  {[
                    { icon: ShieldCheck, title: 'Comprehensive Insurance', desc: 'Full rideshare coverage' },
                    { icon: Calendar, title: 'Routine Servicing', desc: 'Maintenance & tyres included' },
                    { icon: Droplets, title: 'Hybrid Efficiency', desc: 'Average 4.2L/100km' }
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <div className="mt-1 bg-white/5 p-2 border border-white/5">
                        <item.icon className="w-4 h-4 text-brand-gold" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{item.title}</p>
                        <p className="text-xs text-brand-grey mt-1 font-light">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <Link 
                to="/apply"
                className={`flex items-center justify-center gap-3 w-full py-5 font-bold text-sm transition-all uppercase tracking-widest ${
                  car.status === 'Available'
                    ? 'bg-brand-gold hover:bg-white text-brand-charcoal shadow-[0_0_20px_rgba(198,169,79,0.1)]' 
                    : 'bg-white/5 text-brand-grey/40 cursor-not-allowed border border-white/5'
                }`}
                onClick={(e) => car.status !== 'Available' && e.preventDefault()}
              >
                {car.status === 'Available' ? (
                  <>Start Application <ChevronRight className="w-4 h-4" /></>
                ) : 'Currently Rented'}
              </Link>
              
              <p className="text-center text-[10px] text-brand-grey/60 mt-6 uppercase tracking-[0.2em] font-medium">
                Fast approval within 24 hours.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

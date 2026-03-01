import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchCar } from '../lib/api';
import { Calendar, ShieldCheck, Droplets, ArrowLeft, CheckCircle, Car, ChevronRight, Info } from 'lucide-react';
import { motion } from 'motion/react';

export default function CarDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: car, isLoading, error } = useQuery({
    queryKey: ['car', id],
    queryFn: () => fetchCar(id!),
    enabled: !!id,
  });

  const PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=1600";

  if (isLoading) return <div className="flex justify-center py-32 bg-brand-navy min-h-screen"><div className="w-12 h-12 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div></div>;
  if (error || !car) return <div className="text-center py-32 text-2xl font-serif font-bold text-brand-grey bg-brand-navy min-h-screen">Vehicle not found</div>;

  return (
    <div className="bg-brand-navy min-h-screen py-24 text-white selection:bg-brand-gold selection:text-brand-navy">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button onClick={() => navigate(-1)} className="flex items-center text-brand-grey hover:text-brand-gold font-bold mb-12 transition-colors uppercase tracking-[0.2em] text-[10px]">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Fleet
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-7 space-y-8">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-brand-navy-light border border-white/10 overflow-hidden relative group shadow-2xl">
              <div className="relative h-[500px] overflow-hidden">
                <img src={car.image || PLACEHOLDER_IMAGE} alt={car.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-navy via-transparent to-transparent opacity-60"></div>
                <div className="absolute bottom-8 left-8">
                  <div className="inline-block bg-brand-gold text-brand-navy text-[10px] font-bold px-4 py-1.5 uppercase tracking-widest mb-4">Toyota Hybrid Fleet</div>
                  <h1 className="text-4xl md:text-6xl font-serif font-bold text-white leading-tight tracking-tight">{car.name}</h1>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-5">
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-brand-navy-light border border-white/10 p-10 lg:p-12 sticky top-32 shadow-2xl">
              <div className="flex justify-between items-end mb-10 pb-10 border-b border-white/10">
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
                <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2"><Info className="w-4 h-4 text-brand-gold" /> Vehicle Specifications</h3>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div><p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Model Year</p><p className="text-sm font-bold text-white">{car.modelYear}</p></div>
                  <div><p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Fuel Type</p><p className="text-sm font-bold text-white">Hybrid Electric</p></div>
                </div>
              </div>

              <Link to={`/checkout/${car.id}`} state={{ car, totalAmount: car.bond + car.weeklyPrice + 10 + 2.2 }} className={`flex items-center justify-center gap-3 w-full py-5 font-bold text-sm transition-all uppercase tracking-widest shadow-lg ${car.status === 'Available' ? 'bg-brand-gold hover:bg-brand-gold-light text-brand-navy' : 'bg-white/5 text-brand-grey/40 cursor-not-allowed border border-white/10'}`} onClick={(e) => car.status !== 'Available' && e.preventDefault()}>
                {car.status === 'Available' ? <>Book Now <ChevronRight className="w-4 h-4" /></> : 'Currently Rented'}
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

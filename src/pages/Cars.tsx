import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Car as CarIcon, Calendar, Gauge, Shield, ChevronRight, Loader2, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchCars } from '../lib/api';
import { Car } from '../types';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export default function Cars() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    const loadCars = async () => {
      try {
        const data = await fetchCars();
        setCars(data);
      } catch (err) {
        setError('Failed to load vehicles. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    loadCars();
  }, []);

  const filteredCars = activeFilter === 'All' 
    ? cars 
    : cars.filter(car => car.status === activeFilter);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 min-h-screen bg-brand-navy">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeIn}
          >
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 uppercase tracking-tighter">
              Our <span className="text-brand-gold italic">Fleet</span>
            </h1>
            <p className="text-brand-grey text-lg max-w-xl font-light leading-relaxed">
              Premium Toyota Camry Hybrids maintained to the highest standards. 
              Efficiency, comfort, and reliability for every driver.
            </p>
          </motion.div>

          <div className="flex gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
            {['All', 'Available', 'Rented'].map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${
                  activeFilter === filter 
                    ? 'bg-brand-gold text-brand-navy' 
                    : 'text-brand-grey hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/20 p-8 text-center rounded-2xl">
            <p className="text-red-500 font-bold uppercase tracking-widest text-sm">{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredCars.map((car, index) => (
              <motion.div
                key={car.id}
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { delay: index * 0.1 } }
                }}
                className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-brand-gold/30 transition-all duration-500"
              >
                <div className="aspect-[16/10] overflow-hidden relative">
                  <img 
                    src={car.image} 
                    alt={car.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute top-4 right-4">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md border ${
                      car.status === 'Available' 
                        ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                        : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    }`}>
                      {car.status}
                    </span>
                  </div>
                </div>
                
                <div className="p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1 group-hover:text-brand-gold transition-colors">{car.name}</h3>
                      <p className="text-brand-grey text-xs uppercase tracking-widest">{car.model_year} Model</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-brand-gold">${car.weekly_price}</span>
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest">/ Week</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="flex flex-col items-center p-3 bg-white/5 rounded-xl border border-white/5 group-hover:bg-white/10 transition-colors">
                      <Calendar className="w-4 h-4 text-brand-gold mb-2" />
                      <span className="text-[10px] text-brand-grey uppercase tracking-tighter">Automatic</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-white/5 rounded-xl border border-white/5 group-hover:bg-white/10 transition-colors">
                      <Gauge className="w-4 h-4 text-brand-gold mb-2" />
                      <span className="text-[10px] text-brand-grey uppercase tracking-tighter">Hybrid</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-white/5 rounded-xl border border-white/5 group-hover:bg-white/10 transition-colors">
                      <Shield className="w-4 h-4 text-brand-gold mb-2" />
                      <span className="text-[10px] text-brand-grey uppercase tracking-tighter">Insured</span>
                    </div>
                  </div>

                  <Link 
                    to={`/cars/${car.id}`}
                    className="flex items-center justify-center gap-3 w-full py-4 bg-white/5 border border-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-brand-gold hover:text-brand-navy hover:border-brand-gold transition-all group-hover:shadow-lg group-hover:shadow-brand-gold/10"
                  >
                    View Details
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

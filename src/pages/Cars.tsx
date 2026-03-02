import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchCars } from '../lib/api';
import { CarFront, Filter, Ban, ArrowRight } from 'lucide-react';

export default function Cars() {
  const [filter, setFilter] = useState('all');

  const { data: cars = [], isLoading, error } = useQuery({
    queryKey: ['cars'],
    queryFn: fetchCars,
  });

  const filteredCars = cars.filter((car: any) => {
    if (filter === 'available') return car.status === 'Available';
    return true;
  });

  const PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1600&auto=format&fit=crop";

  if (error) return <div className="bg-brand-navy min-h-screen flex items-center justify-center text-white">Error loading vehicles</div>;

  return (
    <div className="bg-brand-navy min-h-screen py-24 text-white selection:bg-brand-gold selection:text-brand-navy">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-white/10 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/30 text-brand-gold text-[10px] font-bold tracking-widest uppercase mb-4">Our Fleet</div>
            <h1 className="text-4xl md:text-6xl font-serif font-bold text-white tracking-tight">Premium Hybrid Vehicles</h1>
          </div>
          <div className="mt-8 md:mt-0 flex items-center gap-3 bg-brand-navy-light p-2 border border-white/10 backdrop-blur-sm">
            <Filter className="w-5 h-5 text-brand-gold ml-3" />
            <select className="bg-transparent border-none focus:ring-0 text-white font-bold py-2 pr-8 uppercase tracking-widest text-[10px] outline-none cursor-pointer" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all" className="bg-brand-navy text-white">All Vehicles</option>
              <option value="available" className="bg-brand-navy text-white">Available Only</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-32"><div className="w-12 h-12 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {filteredCars.map((car: any) => (
              <div key={car.id} className="bg-brand-navy-light border border-white/10 overflow-hidden hover:border-brand-gold/30 hover:shadow-2xl transition-all duration-500 ease-out group flex flex-col relative">
                <div className="relative h-72 overflow-hidden bg-brand-navy">
                  <img src={car.image || PLACEHOLDER_IMAGE} alt={car.name} className={`w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110 ${car.status !== 'Available' ? 'grayscale opacity-60' : ''}`} referrerPolicy="no-referrer" />
                  {car.status !== 'Available' && <div className="absolute top-4 right-4 bg-red-900/90 backdrop-blur-md text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2 border border-red-500/30 z-20 flex items-center gap-2"><Ban className="w-4 h-4" />{car.status || 'Rented'}</div>}
                </div>
                <div className="p-8 flex-grow flex flex-col relative z-20">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-2xl font-serif font-bold text-white leading-tight tracking-tight">{car.name}</h3>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-brand-gold">${car.weeklyPrice}</span>
                      <span className="text-[10px] text-brand-grey uppercase tracking-widest block mt-1">/ week</span>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <Link to={`/cars/${car.id}`} className={`flex items-center justify-center gap-2 w-full text-center font-bold py-5 transition-all duration-300 uppercase tracking-widest text-xs ${car.status === 'Available' ? 'bg-brand-gold hover:bg-brand-gold-light text-brand-navy shadow-lg' : 'bg-white/5 text-brand-grey/40 cursor-not-allowed border border-white/5'}`} onClick={(e) => car.status !== 'Available' && e.preventDefault()}>
                      {car.status === 'Available' ? <>View Details <ArrowRight className="w-4 h-4" /></> : 'Currently Rented'}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

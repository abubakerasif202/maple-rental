import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCars } from '../lib/api';
import { CarFront, Filter, Ban, ArrowRight } from 'lucide-react';

export default function Cars() {
  const [cars, setCars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, available

  useEffect(() => {
    fetchCars()
      .then(data => setCars(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filteredCars = cars.filter(car => {
    if (filter === 'available') return car.status === 'Available';
    return true;
  });

  return (
    <div className="bg-brand-charcoal min-h-screen py-24 text-white selection:bg-brand-gold selection:text-brand-charcoal">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-white/5 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-brand-gold text-[10px] font-bold tracking-widest uppercase mb-4">
              Our Fleet
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">Premium Hybrid Vehicles</h1>
            <p className="text-brand-grey mt-4 text-lg font-light max-w-2xl">Choose from our selection of meticulously maintained Toyota Camry Hybrids, ready for professional Uber drivers.</p>
          </div>
          
          <div className="mt-8 md:mt-0 flex items-center gap-3 bg-brand-charcoal p-2 border border-white/5 backdrop-blur-sm">
            <Filter className="w-5 h-5 text-brand-gold ml-3" />
            <select 
              className="bg-transparent border-none focus:ring-0 text-white font-bold py-2 pr-8 uppercase tracking-widest text-[10px] outline-none cursor-pointer"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all" className="bg-brand-charcoal text-white">All Vehicles</option>
              <option value="available" className="bg-brand-charcoal text-white">Available Only</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-32">
            <div className="w-12 h-12 border-2 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredCars.map(car => (
              <div key={car.id} className="bg-brand-charcoal border border-white/5 overflow-hidden hover:border-brand-gold/30 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 ease-out group flex flex-col relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-brand-charcoal/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 pointer-events-none"></div>
                
                <div className="relative h-64 overflow-hidden bg-brand-charcoal">
                  <img 
                    src={car.image} 
                    alt={car.name} 
                    className={`w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110 ${car.status !== 'Available' ? 'grayscale opacity-60' : ''}`}
                    referrerPolicy="no-referrer"
                  />
                  {car.status !== 'Available' && (
                    <div className="absolute top-4 right-4 bg-red-900/90 backdrop-blur-md text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2 border border-red-500/30 z-20 flex items-center gap-2">
                      <Ban className="w-4 h-4" />
                      {car.status || 'Rented'}
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-3 py-1 border border-white/10 z-20">
                    <span className="text-[10px] font-bold text-brand-gold tracking-widest uppercase">Hybrid</span>
                  </div>
                </div>
                
                <div className="p-8 flex-grow flex flex-col relative z-20">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-2xl font-serif font-bold text-white leading-tight tracking-tight">{car.name}</h3>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-brand-gold">${car.weeklyPrice}</span>
                      <span className="text-[10px] text-brand-grey uppercase tracking-widest block mt-1">/ week</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-brand-grey mb-8 border-t border-white/5 pt-6">
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 border border-white/5">
                      <CarFront className="w-4 h-4 text-brand-gold" /> {car.modelYear}
                    </div>
                    <div className="bg-white/5 px-3 py-1.5 border border-white/5">Bond: ${car.bond}</div>
                  </div>

                  <div className="mt-auto">
                    <Link 
                      to={`/cars/${car.id}`}
                      className={`flex items-center justify-center gap-2 w-full text-center font-bold py-5 transition-all duration-300 uppercase tracking-widest text-xs ${
                        car.status === 'Available' 
                          ? 'bg-brand-gold hover:bg-white hover:scale-105 text-brand-charcoal shadow-[0_0_20px_rgba(198,169,79,0.1)] hover:shadow-[0_0_30px_rgba(198,169,79,0.2)]' 
                          : 'bg-white/5 text-brand-grey/40 cursor-not-allowed border border-white/5'
                      }`}
                      onClick={(e) => car.status !== 'Available' && e.preventDefault()}
                    >
                      {car.status === 'Available' ? (
                        <>Apply Now <ArrowRight className="w-4 h-4" /></>
                      ) : 'Currently Rented'}
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

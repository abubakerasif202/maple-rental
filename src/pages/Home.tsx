import { useEffect, useState } from 'react';
import { fetchCars } from '../lib/api';
import Hero from '../components/home/Hero';
import CredibilityStrip from '../components/home/CredibilityStrip';
import Positioning from '../components/home/Positioning';
import Pricing from '../components/home/Pricing';
import Process from '../components/home/Process';
import CTA from '../components/home/CTA';

export default function Home() {
  const [priceRange, setPriceRange] = useState<{ min: number; max: number } | null>(null);

  useEffect(() => {
    fetchCars().then((cars) => {
      if (cars.length > 0) {
        const prices = cars.map(c => c.weeklyPrice);
        setPriceRange({
          min: Math.min(...prices),
          max: Math.max(...prices)
        });
      }
    }).catch(err => console.error('Failed to fetch car prices for home page:', err));
  }, []);

  return (
    <div className="bg-brand-charcoal text-white min-h-screen font-sans selection:bg-brand-gold selection:text-black">
      <Hero priceRange={priceRange} />
      <CredibilityStrip />
      <Positioning />
      <Pricing priceRange={priceRange} />
      <Process />
      <CTA />
    </div>
  );
}

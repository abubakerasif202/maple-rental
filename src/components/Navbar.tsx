import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

const LogoIcon = ({ className = "w-12 h-12" }) => (
  <div className={`relative ${className} rounded-full border-2 border-slate-400 bg-brand-navy shadow-lg flex items-center justify-center overflow-hidden`}>
    <svg viewBox="0 0 100 100" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Maple Leaf */}
      <path 
        d="M50 45 L55 35 L65 38 L60 28 L70 25 L60 20 L65 10 L50 15 L35 10 L40 20 L30 25 L40 28 L35 38 L45 35 Z" 
        fill="#D4AF37" 
      />
      {/* Car Silhouette */}
      <path 
        d="M20 55 C20 50 30 48 50 48 C70 48 80 50 80 55 L85 60 L15 60 Z" 
        fill="#E2E8F0" 
      />
      {/* Text placeholder */}
      <text x="50" y="75" textAnchor="middle" fill="#D4AF37" fontSize="8" fontWeight="bold" fontFamily="serif">MAPLE</text>
      <text x="50" y="85" textAnchor="middle" fill="#D4AF37" fontSize="6" fontWeight="bold" fontFamily="serif">RENTALS</text>
    </svg>
  </div>
);

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Our Fleet', path: '/cars' },
    { name: 'Platform', path: '/platform' },
    { name: 'Apply', path: '/apply' },
    { name: 'Contact', path: '/#contact' },
  ];

  return (
    <nav className="bg-brand-navy border-b border-white/10 sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-20 md:h-24">
          {/* Left: Logo */}
          <div className="flex-1 flex justify-start">
            <Link to="/" className="flex items-center gap-4 group">
              <LogoIcon className="w-12 h-12 md:w-14 md:h-14" />
              <div className="flex flex-col">
                <span className="font-serif font-bold text-lg md:text-xl text-white tracking-[0.1em] uppercase leading-none">MAPLE</span>
                <span className="font-serif text-xs md:text-sm text-brand-gold tracking-[0.2em] uppercase">RENTALS</span>
              </div>
            </Link>
          </div>
          
          {/* Center: Navigation */}
          <div className="hidden md:flex flex-[2] justify-center items-center space-x-10">
            {navLinks.map((link) => (
              <Link 
                key={link.name}
                to={link.path} 
                className="text-brand-grey hover:text-white text-[11px] font-bold tracking-[0.2em] uppercase transition-colors"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Right: Phone CTA */}
          <div className="hidden md:flex flex-1 justify-end items-center">
            <a 
              href="tel:0420550556" 
              className="border border-brand-gold/30 hover:border-brand-gold px-6 py-2.5 text-[11px] font-bold text-white uppercase tracking-[0.15em] transition-all hover:bg-brand-gold/5"
            >
              0420 550 556
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="text-brand-grey hover:text-white transition-colors">
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-brand-navy border-t border-white/10">
          <div className="px-6 py-8 space-y-6">
            {navLinks.map((link) => (
              <Link 
                key={link.name}
                to={link.path} 
                onClick={() => setIsOpen(false)} 
                className="block text-[11px] font-bold text-brand-grey hover:text-white uppercase tracking-[0.2em]"
              >
                {link.name}
              </Link>
            ))}
            <div className="pt-6 border-t border-white/5">
              <a 
                href="tel:0420550556" 
                className="block text-center border border-brand-gold/30 py-3 text-[11px] font-bold text-brand-gold uppercase tracking-[0.2em]"
              >
                0420 550 556
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

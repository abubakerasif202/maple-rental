import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

const LogoIcon = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Proper Iconic Maple Leaf */}
    <path 
      d="M50 95 V80 M50 80 C45 80 40 75 35 70 L20 75 L25 55 L10 50 L20 35 L15 15 L40 25 L50 5 L60 25 L85 15 L80 35 L90 50 L75 55 L80 75 L65 70 C60 75 55 80 50 80" 
      fill="#E67E22" 
      stroke="#8B4513" 
      strokeWidth="1.2" 
      strokeLinejoin="round"
    />
    {/* Centered MR Monogram */}
    <text 
      x="50" 
      y="52" 
      textAnchor="middle" 
      fill="white" 
      fontSize="10" 
      fontWeight="900" 
      fontFamily="Inter, sans-serif"
      style={{ letterSpacing: '-0.02em' }}
    >
      MR
    </text>
  </svg>
);

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Our Fleet', path: '/cars' },
    { name: 'Apply', path: '/apply' },
    { name: 'Contact', path: '/#contact' },
  ];

  return (
    <nav className="bg-brand-charcoal border-b border-white/5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-20 md:h-24">
          {/* Left: Logo */}
          <div className="flex-1 flex justify-start">
            <Link to="/" className="flex items-center gap-4 group">
              <span className="font-serif font-bold text-xl md:text-2xl text-white tracking-[0.15em] uppercase">MAPLE</span>
              <LogoIcon className="w-8 h-8 md:w-10 md:h-10" />
              <span className="font-script text-xl md:text-2xl text-brand-gold/80">Rentals</span>
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
        <div className="md:hidden bg-brand-charcoal border-t border-white/5">
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

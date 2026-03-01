import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';



export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Our Fleet', path: '/cars' },
    { name: 'Apply', path: '/apply' },
    { name: 'Contact', path: '/#contact' },
  ];

  return (
    <nav className="bg-brand-navy border-b border-white/10 sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-20 md:h-24">
          {/* Left: Logo */}
          <div className="flex-1 flex justify-start">
            <Link to="/" className="flex items-center group">
              <img
                src="/logo.png"
                alt="Maple Rentals Logo"
                className="h-12 md:h-16 object-contain bg-white rounded-lg px-2 py-1"
              />
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

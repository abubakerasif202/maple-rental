import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';

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

export default function Footer() {
  return (
    <footer className="bg-brand-charcoal text-gray-400 py-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div>
            <Link to="/" className="flex items-center gap-6 mb-8 group">
              <span className="font-serif font-bold text-2xl text-white tracking-[0.1em] uppercase">MAPLE</span>
              <LogoIcon className="w-10 h-10" />
              <span className="font-script text-2xl text-brand-gold">Rentals</span>
            </Link>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed font-light">
              Sydney's professional fleet company supplying Toyota Camry Hybrid vehicles exclusively for Uber drivers.
            </p>
          </div>
          
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Quick Links</h3>
            <ul className="space-y-5">
              <li><Link to="/" className="text-sm hover:text-[#C6A94F] transition-colors font-light">Home</Link></li>
              <li><Link to="/cars" className="text-sm hover:text-[#C6A94F] transition-colors font-light">Our Fleet</Link></li>
              <li><Link to="/admin/login" className="text-sm hover:text-[#C6A94F] transition-colors font-light opacity-50">Admin Login</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-8">Contact Us</h3>
            <ul className="space-y-5">
              <li className="flex items-center gap-4">
                <Phone className="h-4 w-4 text-[#C6A94F]" />
                <a href="tel:0420550556" className="text-sm hover:text-[#C6A94F] transition-colors font-light tracking-wider">0420 550 556</a>
              </li>
              <li className="flex items-center gap-4">
                <Mail className="h-4 w-4 text-[#C6A94F]" />
                <a href="mailto:hello@maplerentals.com.au" className="text-sm hover:text-[#C6A94F] transition-colors font-light">hello@maplerentals.com.au</a>
              </li>
              <li className="text-xs text-gray-600 mt-8 space-y-2 font-light">
                <p>Sarfaraz Rajabi</p>
                <p>Licence No: 317786C</p>
                <p>ABN No: 16623061941</p>
                <p>ACN No: 623061941</p>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/5 mt-20 pt-8 text-center text-xs text-gray-600 uppercase tracking-widest font-light">
          &copy; {new Date().getFullYear()} Maple Rentals. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

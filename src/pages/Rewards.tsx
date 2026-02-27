import { motion } from 'motion/react';
import { 
  Leaf, 
  CheckCircle, 
  Fuel, 
  Wrench, 
  DollarSign, 
  Headphones, 
  History, 
  CreditCard, 
  Car, 
  Star, 
  ShoppingBag, 
  Gift, 
  HelpCircle, 
  Mail,
  TrendingUp
} from 'lucide-react';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function Rewards() {
  return (
    <div className="bg-brand-navy min-h-screen py-24 text-white selection:bg-brand-gold selection:text-brand-navy">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.header 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-[10px] font-bold tracking-widest uppercase mb-4">
            Elite Loyalty Program
          </div>
          <h1 className="font-serif text-4xl md:text-6xl font-bold mb-6 tracking-tight">Driver Rewards</h1>
          <p className="text-brand-grey max-w-2xl text-lg font-light leading-relaxed">
            Exclusively for our professional partners. The more you drive, the more you earn with Maple Rentals elite loyalty program.
          </p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-12">
            {/* Status Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="relative group"
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-gold via-orange-500 to-brand-gold rounded-none blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
              <div className="relative bg-brand-navy-light p-10 border border-white/10 overflow-hidden shadow-2xl">
                <div className="absolute -right-20 -top-20 opacity-5">
                  <Leaf className="w-80 h-80 text-brand-gold" />
                </div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 relative z-10">
                  <div>
                    <p className="text-brand-gold text-[10px] uppercase tracking-[0.3em] font-bold mb-2">Current Status</p>
                    <h2 className="font-serif text-4xl font-bold text-white flex items-center gap-4">
                      Gold Tier <CheckCircle className="w-8 h-8 text-brand-gold" />
                    </h2>
                  </div>
                  <div className="mt-6 md:mt-0 text-left md:text-right">
                    <p className="text-brand-grey text-[10px] uppercase tracking-widest mb-2">Total Points</p>
                    <p className="text-4xl font-bold text-white tracking-tight">12,450</p>
                  </div>
                </div>

                <div className="relative z-10">
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-xs text-brand-grey uppercase tracking-widest">Next Level: <span className="text-white font-bold">Platinum Tier</span></span>
                    <span className="text-xs text-brand-gold font-bold tracking-widest">2,550 pts to go</span>
                  </div>
                  <div className="h-2 w-full bg-brand-navy rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: "75%" }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-brand-gold to-orange-500 rounded-full"
                    ></motion.div>
                  </div>
                  <div className="mt-8 flex gap-4">
                    <div className="bg-brand-navy px-4 py-2 border border-white/10 flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-brand-gold" />
                      <span className="text-[10px] uppercase tracking-widest text-brand-grey">Tier Multiplier: <strong className="text-white">1.2x</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Benefits Section */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
            >
              <h3 className="font-serif text-2xl font-bold mb-10 flex items-center gap-4">
                <span className="w-12 h-[1px] bg-brand-gold"></span>
                Exclusive Benefits
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { icon: Fuel, title: "Fuel Rebates", desc: "Receive a $0.05/L rebate on all fuel purchases at partner stations nationwide." },
                  { icon: Wrench, title: "Priority Servicing", desc: "Skip the queue for regular maintenance and immediate vehicle swaps when needed." },
                  { icon: DollarSign, title: "Weekly Discounts", desc: "Current Gold status grants a 5% discount on your weekly rental base rate." },
                  { icon: Headphones, title: "24/7 Concierge", desc: "Direct line to a dedicated support manager for all your administrative needs." }
                ].map((benefit, idx) => (
                  <motion.div 
                    key={idx}
                    variants={fadeIn}
                    className="bg-brand-navy-light p-8 border border-white/10 hover:border-brand-gold/30 transition-all group shadow-xl"
                  >
                    <div className="w-12 h-12 bg-brand-gold/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <benefit.icon className="w-6 h-6 text-brand-gold" />
                    </div>
                    <h4 className="font-bold text-lg mb-3 tracking-tight">{benefit.title}</h4>
                    <p className="text-sm text-brand-grey font-light leading-relaxed">{benefit.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-brand-navy-light border border-white/10 overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/10 bg-brand-navy/30">
                <h3 className="font-serif text-xl font-bold flex items-center gap-3">
                  <History className="w-5 h-5 text-brand-gold" />
                  Points History
                </h3>
              </div>
              <div className="p-8">
                <ul className="space-y-8">
                  {[
                    { icon: CreditCard, title: "Weekly Payment", date: "Oct 24, 2023", pts: "+500", color: "text-emerald-500" },
                    { icon: Car, title: "1,000km Milestone", date: "Oct 20, 2023", pts: "+250", color: "text-brand-gold" },
                    { icon: Star, title: "Uber 5-Star Bonus", date: "Oct 18, 2023", pts: "+1,200", color: "text-blue-500" },
                    { icon: ShoppingBag, title: "Fuel Rebate Claim", date: "Oct 15, 2023", pts: "-150", color: "text-brand-grey" }
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand-navy flex items-center justify-center border border-white/10">
                          <item.icon className="w-4 h-4 text-brand-gold" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{item.title}</p>
                          <p className="text-[10px] text-brand-grey uppercase tracking-widest mt-1">{item.date}</p>
                        </div>
                      </div>
                      <span className={`font-bold text-sm ${item.color}`}>{item.pts}</span>
                    </li>
                  ))}
                </ul>
                <button className="w-full mt-10 py-4 px-6 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-all">
                  View Full History
                </button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-brand-gold/10 border border-brand-gold/20 p-8 relative overflow-hidden group shadow-xl"
            >
              <div className="relative z-10">
                <h4 className="font-bold text-xl mb-3 tracking-tight">Ready to redeem?</h4>
                <p className="text-sm text-brand-grey mb-8 font-light leading-relaxed">Use your points to get extra rental credits or luxury vehicle upgrades.</p>
                <button className="bg-brand-gold text-brand-navy font-bold text-[10px] uppercase tracking-[0.2em] px-8 py-3 shadow-xl shadow-brand-gold/10 hover:bg-brand-gold-light transition-all">
                  Redeem Points
                </button>
              </div>
              <Gift className="absolute -bottom-6 -right-6 w-32 h-32 text-brand-gold/10 group-hover:scale-110 transition-transform duration-700" />
            </motion.div>
          </aside>
        </div>

        {/* Footer */}
        <motion.footer 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-24 pt-12 border-t border-white/5 text-center"
        >
          <p className="text-brand-grey text-sm font-light mb-8">Questions about your rewards status?</p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-8">
            <a href="#" className="inline-flex items-center gap-3 text-brand-gold font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">
              <HelpCircle className="w-4 h-4" />
              Program Terms
            </a>
            <span className="hidden sm:block text-white/10">|</span>
            <a href="#" className="inline-flex items-center gap-3 text-brand-gold font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">
              <Mail className="w-4 h-4" />
              Contact Support
            </a>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Car, Calendar, DollarSign, Plus, Edit, Trash2, Users, FileText, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({ totalApplications: 0, activeRentals: 0, totalWeeklyIncome: 0 });
  const [cars, setCars] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [editingCar, setEditingCar] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/admin/login');
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    const fetchData = async () => {
      try {
        const [statsRes, carsRes, appsRes, rentalsRes] = await Promise.all([
          fetch('/api/stats', { headers }),
          fetch('/api/cars', { headers }),
          fetch('/api/applications', { headers }),
          fetch('/api/rentals', { headers })
        ]);

        if (statsRes.status === 401) throw new Error('Unauthorized');

        setStats(await statsRes.json());
        setCars(await carsRes.json());
        setApplications(await appsRes.json());
        setRentals(await rentalsRes.json());
      } catch (err) {
        console.error('Fetch error:', err);
        localStorage.removeItem('admin_token');
        navigate('/admin/login');
      }
    };

    fetchData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/admin/login');
  };

  const updateApplicationStatus = async (id: number, status: string) => {
    const token = localStorage.getItem('admin_token');
    await fetch(`/api/applications/${id}/status`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    
    setApplications(applications.map(a => a.id === id ? { ...a, status } : a));
  };

  const deleteCar = async (id: number) => {
    if (!confirm('Are you sure you want to delete this car?')) return;
    const token = localStorage.getItem('admin_token');
    await fetch(`/api/cars/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    setCars(cars.filter(c => c.id !== id));
  };

  const handleEditClick = (car: any) => {
    setEditingCar({ ...car });
    setIsEditModalOpen(true);
  };

  const handleUpdateCar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCar) return;

    const token = localStorage.getItem('admin_token');
    try {
      const response = await fetch(`/api/cars/${editingCar.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editingCar)
      });

      if (response.ok) {
        setCars(cars.map(c => c.id === editingCar.id ? editingCar : c));
        setIsEditModalOpen(false);
        setEditingCar(null);
      } else {
        alert('Failed to update car');
      }
    } catch (error) {
      console.error('Error updating car:', error);
      alert('An error occurred while updating the car');
    }
  };

  return (
    <div className="min-h-screen bg-brand-charcoal text-white flex font-sans selection:bg-brand-gold selection:text-brand-charcoal">
      {/* Sidebar */}
      <div className="w-72 bg-brand-charcoal border-r border-white/5 flex flex-col sticky top-0 h-screen">
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-gold flex items-center justify-center text-brand-charcoal font-black text-lg">MR</div>
            <div>
              <h2 className="text-sm font-serif font-bold tracking-widest uppercase">MAPLE RENTALS</h2>
              <p className="text-[10px] text-brand-gold font-medium tracking-[0.4em] uppercase">Admin</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-6 space-y-2">
          {[
            { id: 'dashboard', icon: DollarSign, label: 'Dashboard' },
            { id: 'applications', icon: FileText, label: 'Applications' },
            { id: 'rentals', icon: Calendar, label: 'Rentals' },
            { id: 'cars', icon: Car, label: 'Fleet' },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 text-sm font-bold uppercase tracking-widest transition-all ${activeTab === item.id ? 'bg-brand-gold text-brand-charcoal' : 'text-brand-grey hover:text-white hover:bg-white/5'}`}
            >
              <item.icon className="w-5 h-5" /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-white/5">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-5 py-4 text-sm font-bold uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-12 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h1 className="text-3xl font-serif font-bold mb-12 tracking-tight">Dashboard Overview</h1>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div className="bg-brand-charcoal p-10 border border-white/5 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-1 h-full bg-brand-gold"></div>
                  <div className="flex items-center gap-4 mb-6">
                    <DollarSign className="w-6 h-6 text-brand-gold" />
                    <h3 className="text-xs font-bold text-brand-grey uppercase tracking-widest">Weekly Income</h3>
                  </div>
                  <p className="text-4xl font-bold text-white">${stats.totalWeeklyIncome.toLocaleString()}</p>
                </div>
                <div className="bg-brand-charcoal p-10 border border-white/5 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                  <div className="flex items-center gap-4 mb-6">
                    <Users className="w-6 h-6 text-blue-500" />
                    <h3 className="text-xs font-bold text-brand-grey uppercase tracking-widest">Total Applications</h3>
                  </div>
                  <p className="text-4xl font-bold text-white">{stats.totalApplications}</p>
                </div>
                <div className="bg-brand-charcoal p-10 border border-white/5 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                  <div className="flex items-center gap-4 mb-6">
                    <Car className="w-6 h-6 text-emerald-500" />
                    <h3 className="text-xs font-bold text-brand-grey uppercase tracking-widest">Active Rentals</h3>
                  </div>
                  <p className="text-4xl font-bold text-white">{stats.activeRentals}</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'applications' && (
            <motion.div 
              key="applications"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h1 className="text-3xl font-serif font-bold mb-12 tracking-tight">Driver Applications</h1>
              <div className="bg-brand-charcoal border border-white/5 overflow-hidden shadow-2xl rounded-xl">
                <table className="min-w-full divide-y divide-white/5">
                  <thead className="bg-black/20">
                    <tr>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Applicant</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Uber Status</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Budget</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Status</th>
                      <th className="px-8 py-6 text-right text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {applications.map(app => (
                      <tr key={app.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-6">
                          <div className="text-sm font-bold text-white">{app.name}</div>
                          <div className="text-xs text-brand-grey mt-1 font-light">{app.phone} • {app.email}</div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="text-xs text-brand-grey font-light">{app.uberStatus}</span>
                        </td>
                        <td className="px-8 py-6">
                          <span className="text-xs text-brand-grey font-light">{app.weeklyBudget}</span>
                        </td>
                        <td className="px-8 py-6">
                          <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full ${
                            app.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-500' :
                            app.status === 'Rejected' ? 'bg-red-500/10 text-red-500' :
                            'bg-brand-gold/10 text-brand-gold'
                          }`}>
                            {app.status}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <select 
                            className="bg-brand-charcoal border border-white/10 text-[10px] font-bold uppercase tracking-widest px-3 py-2 outline-none focus:border-brand-gold/50"
                            value={app.status}
                            onChange={(e) => updateApplicationStatus(app.id, e.target.value)}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'cars' && (
            <motion.div 
              key="cars"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex justify-between items-center mb-12">
                <h1 className="text-3xl font-serif font-bold tracking-tight">Fleet Management</h1>
                <button className="bg-brand-gold hover:bg-white text-brand-charcoal px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(198,169,79,0.1)]">
                  <Plus className="w-4 h-4" /> Add Vehicle
                </button>
              </div>
              <div className="bg-brand-charcoal border border-white/5 overflow-hidden shadow-2xl rounded-xl">
                <table className="min-w-full divide-y divide-white/5">
                  <thead className="bg-black/20">
                    <tr>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Vehicle</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Weekly Rate</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Status</th>
                      <th className="px-8 py-6 text-right text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {cars.map(car => (
                      <tr key={car.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-6">
                            <img className="h-12 w-20 object-cover border border-white/5 rounded" src={car.image} alt="" referrerPolicy="no-referrer" />
                            <div>
                              <div className="text-sm font-bold text-white">{car.name}</div>
                              <div className="text-xs text-brand-grey mt-1 font-light">{car.modelYear} Model</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-sm font-bold text-white">${car.weeklyPrice}</div>
                          <div className="text-[10px] text-brand-grey uppercase tracking-widest mt-1">Bond: ${car.bond}</div>
                        </td>
                        <td className="px-8 py-6">
                          <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full ${car.status === 'Available' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                            {car.status}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button onClick={() => handleEditClick(car)} className="text-brand-grey hover:text-brand-gold transition-colors mr-6"><Edit className="w-5 h-5" /></button>
                          <button onClick={() => deleteCar(car.id)} className="text-brand-grey hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'rentals' && (
            <motion.div 
              key="rentals"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h1 className="text-3xl font-serif font-bold mb-12 tracking-tight">Active Rentals</h1>
              <div className="bg-brand-charcoal border border-white/5 overflow-hidden shadow-2xl rounded-xl">
                <table className="min-w-full divide-y divide-white/5">
                  <thead className="bg-black/20">
                    <tr>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Driver</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Vehicle</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Start Date</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Rate</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-grey uppercase tracking-[0.2em]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rentals.map(rental => (
                      <tr key={rental.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-6">
                          <div className="text-sm font-bold text-white">{rental.driverName}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-sm font-bold text-white">{rental.carName}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-sm text-brand-grey font-light">{rental.startDate}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-sm font-bold text-white">${rental.weeklyPrice}/wk</div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-blue-500/10 text-blue-500">
                            {rental.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Car Modal */}
        {isEditModalOpen && editingCar && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-brand-charcoal border border-brand-gold/30 p-10 max-w-2xl w-full rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h2 className="text-2xl font-serif font-bold text-white mb-8 tracking-tight">Edit Vehicle Details</h2>
              <form onSubmit={handleUpdateCar} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Vehicle Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      value={editingCar.name}
                      onChange={(e) => setEditingCar({...editingCar, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Weekly Rate ($)</label>
                    <input 
                      type="number" 
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      value={editingCar.weeklyPrice}
                      onChange={(e) => setEditingCar({...editingCar, weeklyPrice: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Model Year</label>
                    <input 
                      type="number" 
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      value={editingCar.modelYear}
                      onChange={(e) => setEditingCar({...editingCar, modelYear: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Bond ($)</label>
                    <input 
                      type="number" 
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      value={editingCar.bond}
                      onChange={(e) => setEditingCar({...editingCar, bond: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Image URL</label>
                    <input 
                      type="url" 
                      required
                      className="w-full bg-brand-charcoal border border-white/10 px-4 py-3 text-white focus:border-brand-gold/50 outline-none transition-colors font-light"
                      value={editingCar.image}
                      onChange={(e) => setEditingCar({...editingCar, image: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-3 pt-4">
                  <select 
                    className="bg-brand-charcoal border border-white/10 text-[10px] font-bold uppercase tracking-widest px-4 py-3 outline-none focus:border-brand-gold/50"
                    value={editingCar.status}
                    onChange={(e) => setEditingCar({...editingCar, status: e.target.value})}
                  >
                    <option value="Available">Available</option>
                    <option value="Rented">Rented</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="flex justify-end gap-5 mt-12 pt-8 border-t border-white/5">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingCar(null);
                    }}
                    className="px-8 py-3 text-xs font-bold uppercase tracking-widest text-brand-grey hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="bg-brand-gold hover:bg-white text-brand-charcoal px-10 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-lg"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

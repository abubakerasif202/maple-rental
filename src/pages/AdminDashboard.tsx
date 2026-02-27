import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Car, Calendar, DollarSign, Plus, Edit, Trash2, Users, FileText, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import { Car as CarType, Application, Rental, DashboardStats } from '../types';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingCar, setEditingCar] = useState<CarType | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [newCar, setNewCar] = useState<Omit<CarType, 'id'>>({
    name: '',
    modelYear: new Date().getFullYear(),
    weeklyPrice: 0,
    bond: 0,
    status: 'Available',
    image: ''
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Queries
  const { data: stats = { totalApplications: 0, activeRentals: 0, totalWeeklyIncome: 0 } as DashboardStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.fetchStats,
  });

  const { data: cars = [] as CarType[], isLoading: isLoadingCars } = useQuery({
    queryKey: ['cars'],
    queryFn: api.fetchCars,
    enabled: activeTab === 'cars' || activeTab === 'dashboard',
  });

  const { data: applications = [] as Application[], isLoading: isLoadingApplications } = useQuery({
    queryKey: ['applications'],
    queryFn: api.fetchApplications,
    enabled: activeTab === 'applications' || activeTab === 'dashboard',
  });

  const { data: rentals = [] as Rental[], isLoading: isLoadingRentals } = useQuery({
    queryKey: ['rentals'],
    queryFn: api.fetchRentals,
    enabled: activeTab === 'rentals' || activeTab === 'dashboard',
  });

  // Mutations
  const updateAppStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updateApplicationStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      showNotification('Application status updated');
    },
    onError: () => showNotification('Failed to update status', 'error'),
  });

  const deleteCarMutation = useMutation({
    mutationFn: (id: number) => api.deleteCar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      showNotification('Vehicle deleted successfully');
    },
    onError: () => showNotification('Failed to delete vehicle', 'error'),
  });

  const updateCarMutation = useMutation({
    mutationFn: (car: CarType) => api.updateCar(car.id, car),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      setIsEditModalOpen(false);
      setEditingCar(null);
      showNotification('Vehicle details updated successfully');
    },
    onError: () => showNotification('Failed to update vehicle', 'error'),
  });

  const addCarMutation = useMutation({
    mutationFn: (car: Omit<CarType, 'id'>) => api.createCar(car),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      setIsAddModalOpen(false);
      setNewCar({
        name: '',
        modelYear: new Date().getFullYear(),
        weeklyPrice: 0,
        bond: 0,
        status: 'Available',
        image: ''
      });
      showNotification('New vehicle added to fleet');
    },
    onError: () => showNotification('Failed to add vehicle', 'error'),
  });

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/admin/login');
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const updateApplicationStatus = (id: number, status: string) => {
    updateAppStatusMutation.mutate({ id, status });
  };

  const deleteCar = (id: number) => {
    if (confirm('Are you sure you want to delete this car?')) {
      deleteCarMutation.mutate(id);
    }
  };

  const handleEditClick = (car: CarType) => {
    setEditingCar({ ...car });
    setIsEditModalOpen(true);
  };

  const handleUpdateCar = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCar) updateCarMutation.mutate(editingCar);
  };

  const handleAddCar = (e: React.FormEvent) => {
    e.preventDefault();
    addCarMutation.mutate(newCar);
  };

  return (
    <div className="min-h-screen bg-brand-navy text-white flex font-sans selection:bg-brand-gold selection:text-brand-navy">
      {/* Sidebar */}
      <div className="w-72 bg-brand-navy border-r border-white/10 flex flex-col sticky top-0 h-screen">
        <div className="p-8 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-gold flex items-center justify-center text-brand-navy font-black text-lg">MR</div>
            <div>
              <h2 className="text-sm font-serif font-bold tracking-widest uppercase">Maple</h2>
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
              className={`w-full flex items-center gap-4 px-5 py-4 text-sm font-bold uppercase tracking-widest transition-all ${activeTab === item.id ? 'bg-brand-gold text-brand-navy' : 'text-brand-grey hover:text-white hover:bg-white/5'}`}
            >
              <item.icon className="w-5 h-5" /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-white/10">
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
                <div className="bg-brand-navy-light p-10 border border-white/10 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-1 h-full bg-brand-gold"></div>
                  <div className="flex items-center gap-4 mb-6">
                    <DollarSign className="w-6 h-6 text-brand-gold" />
                    <h3 className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Weekly Income</h3>
                  </div>
                  <p className="text-4xl font-bold text-white">
                    {isLoadingStats ? '...' : `$${stats.totalWeeklyIncome.toLocaleString()}`}
                  </p>
                </div>
                <div className="bg-brand-navy-light p-10 border border-white/10 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                  <div className="flex items-center gap-4 mb-6">
                    <Users className="w-6 h-6 text-blue-500" />
                    <h3 className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Total Applications</h3>
                  </div>
                  <p className="text-4xl font-bold text-white">
                    {isLoadingStats ? '...' : stats.totalApplications}
                  </p>
                </div>
                <div className="bg-brand-navy-light p-10 border border-white/10 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                  <div className="flex items-center gap-4 mb-6">
                    <Car className="w-6 h-6 text-emerald-500" />
                    <h3 className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Active Rentals</h3>
                  </div>
                  <p className="text-4xl font-bold text-white">
                    {isLoadingStats ? '...' : stats.activeRentals}
                  </p>
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
              <div className="bg-brand-navy-light border border-white/10 overflow-hidden shadow-2xl">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-brand-navy/50">
                    <tr>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Applicant</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Uber Status</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Budget</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Status</th>
                      <th className="px-8 py-6 text-right text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {isLoadingApplications ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-brand-grey text-sm">Loading applications...</td>
                      </tr>
                    ) : applications.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-brand-grey text-sm">No applications found</td>
                      </tr>
                    ) : (
                      applications.map((app: any) => (
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
                              className="bg-brand-navy border border-white/10 text-[10px] font-bold uppercase tracking-widest px-3 py-2 outline-none focus:border-brand-gold"
                              value={app.status}
                              onChange={(e) => updateApplicationStatus(app.id, e.target.value)}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Approved">Approved</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
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
                <button 
                  onClick={() => setIsAddModalOpen(true)}
                  className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg"
                >
                  <Plus className="w-4 h-4" /> Add Vehicle
                </button>
              </div>
              <div className="bg-brand-navy-light border border-white/10 overflow-hidden shadow-2xl">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-brand-navy/50">
                    <tr>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Vehicle</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Weekly Rate</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Status</th>
                      <th className="px-8 py-6 text-right text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {isLoadingCars ? (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-brand-grey text-sm">Loading fleet...</td>
                      </tr>
                    ) : cars.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-brand-grey text-sm">No vehicles in fleet</td>
                      </tr>
                    ) : (
                      cars.map((car: any) => (
                        <tr key={car.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-6">
                              <img className="h-12 w-20 object-cover border border-white/10" src={car.image} alt="" referrerPolicy="no-referrer" />
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
                      ))
                    )}
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
              <div className="bg-brand-navy-light border border-white/10 overflow-hidden shadow-2xl">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-brand-navy/50">
                    <tr>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Driver</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Vehicle</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Start Date</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Rate</th>
                      <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {isLoadingRentals ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-brand-grey text-sm">Loading rentals...</td>
                      </tr>
                    ) : rentals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-brand-grey text-sm">No active rentals</td>
                      </tr>
                    ) : (
                      rentals.map((rental: any) => (
                        <tr key={rental.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-8 py-6">
                            <div className="text-sm font-bold text-white">{rental.applicantName || rental.driverName}</div>
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
                      ))
                    )}
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
              className="bg-brand-navy-light border border-brand-gold/30 p-10 max-w-2xl w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h2 className="text-2xl font-serif font-bold text-white mb-8 tracking-tight">Edit Vehicle Details</h2>
              <form onSubmit={handleUpdateCar} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Vehicle Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.name}
                      onChange={(e) => setEditingCar({...editingCar, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Weekly Rate ($)</label>
                    <input 
                      type="number" 
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.weeklyPrice}
                      onChange={(e) => setEditingCar({...editingCar, weeklyPrice: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Model Year</label>
                    <input 
                      type="number" 
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.modelYear}
                      onChange={(e) => setEditingCar({...editingCar, modelYear: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Bond ($)</label>
                    <input 
                      type="number" 
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.bond}
                      onChange={(e) => setEditingCar({...editingCar, bond: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Image URL</label>
                    <input 
                      type="url" 
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.image}
                      onChange={(e) => setEditingCar({...editingCar, image: e.target.value})}
                    />
                    {editingCar.image && (
                      <div className="mt-4 border border-white/10 p-2 bg-brand-navy/50">
                        <p className="text-[8px] text-brand-gold uppercase tracking-widest mb-2">Image Preview</p>
                        <img 
                          src={editingCar.image} 
                          alt="Preview" 
                          className="w-full h-48 object-cover rounded"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 pt-4">
                  <select 
                    className="bg-brand-navy border border-white/10 text-[10px] font-bold uppercase tracking-widest px-4 py-3 outline-none focus:border-brand-gold"
                    value={editingCar.status}
                    onChange={(e) => setEditingCar({...editingCar, status: e.target.value})}
                  >
                    <option value="Available">Available</option>
                    <option value="Rented">Rented</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="flex justify-end gap-5 mt-12 pt-8 border-t border-white/10">
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
                    className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-10 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-lg"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Add Car Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-brand-navy-light border border-brand-gold/30 p-10 max-w-2xl w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h2 className="text-2xl font-serif font-bold text-white mb-8 tracking-tight">Add New Vehicle</h2>
              <form onSubmit={handleAddCar} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Vehicle Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Toyota Camry Hybrid"
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={newCar.name}
                      onChange={(e) => setNewCar({...newCar, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Weekly Rate ($)</label>
                    <input 
                      type="number" 
                      required
                      placeholder="0"
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={newCar.weeklyPrice}
                      onChange={(e) => setNewCar({...newCar, weeklyPrice: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Model Year</label>
                    <input 
                      type="number" 
                      required
                      placeholder={new Date().getFullYear().toString()}
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={newCar.modelYear}
                      onChange={(e) => setNewCar({...newCar, modelYear: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Bond ($)</label>
                    <input 
                      type="number" 
                      required
                      placeholder="0"
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={newCar.bond}
                      onChange={(e) => setNewCar({...newCar, bond: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Image URL</label>
                    <input 
                      type="url" 
                      required
                      placeholder="https://..."
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={newCar.image}
                      onChange={(e) => setNewCar({...newCar, image: e.target.value})}
                    />
                    {newCar.image && (
                      <div className="mt-4 border border-white/10 p-2 bg-brand-navy/50">
                        <p className="text-[8px] text-brand-gold uppercase tracking-widest mb-2">Image Preview</p>
                        <img 
                          src={newCar.image} 
                          alt="Preview" 
                          className="w-full h-48 object-cover rounded"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 pt-4">
                  <select 
                    className="bg-brand-navy border border-white/10 text-[10px] font-bold uppercase tracking-widest px-4 py-3 outline-none focus:border-brand-gold"
                    value={newCar.status}
                    onChange={(e) => setNewCar({...newCar, status: e.target.value})}
                  >
                    <option value="Available">Available</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="flex justify-end gap-5 mt-12 pt-8 border-t border-white/10">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-8 py-3 text-xs font-bold uppercase tracking-widest text-brand-grey hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-10 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-lg"
                  >
                    Add Vehicle
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 right-8 px-6 py-4 shadow-2xl flex items-center gap-3 z-[100] border ${
              notification.type === 'error' 
                ? 'bg-red-500/10 border-red-500/50 text-red-500' 
                : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500'
            }`}
          >
            {notification.type === 'error' ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            <span className="text-sm font-bold uppercase tracking-widest">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

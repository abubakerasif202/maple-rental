import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  Clock,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Loader2,
  Trash2,
  Edit2,
  FileText,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Building2,
  Globe,
  Car,
  Users
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import * as api from '../lib/api';
import { Car as CarType, Application, Rental, DashboardStats, SaasMerchant } from '../types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/admin/Sidebar';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddingCar, setIsAddingCar] = useState(false);
  const [editingCar, setEditingCar] = useState<CarType | null>(null);
  const [newCar, setNewCar] = useState<Partial<CarType>>({
    name: '',
    model_year: new Date().getFullYear(),
    weekly_price: 0,
    bond: 500,
    status: 'Available',
    image: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1600&auto=format&fit=crop'
  });

  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  
  // Agreement Management State
  const [isGeneratingAgreement, setIsGeneratingAgreement] = useState(false);
  const [selected_agreement_application_id, set_selected_agreement_application_id] = useState<string>('');
  const [selected_agreement_car_id, set_selected_agreement_car_id] = useState<string>('');
  const [agreementContent, setAgreementContent] = useState<string>('');
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
  const [agreementForm, setAgreementForm] = useState({
    renteeName: '',
    vehicleYear: '',
    weeklyRent: '',
    rentalStartDate: new Date().toISOString().split('T')[0],
  });

  // SaaS Management State
  const [isAddingMerchant, setIsAddingMerchant] = useState(false);
  const [newMerchant, setNewMerchant] = useState({
    business_name: '',
    email: '',
    country: 'AU',
    payout_interval: 'weekly' as const
  });

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Queries
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => api.fetchStats(),
  });

  const { data: cars = [] } = useQuery<CarType[]>({
    queryKey: ['cars'],
    queryFn: () => api.fetchCars(),
  });

  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ['applications'],
    queryFn: () => api.fetchApplications(),
  });

  const { data: rentals = [] } = useQuery<Rental[]>({
    queryKey: ['rentals'],
    queryFn: () => api.fetchRentals(),
  });

  const { data: merchants = [] } = useQuery<SaasMerchant[]>({
    queryKey: ['merchants'],
    queryFn: () => api.fetchSaasMerchants(),
  });

  const { data: savedAgreements = [] } = useQuery({
    queryKey: ['agreements'],
    queryFn: () => api.fetchSavedLeaseAgreements(),
  });

  // Mutations
  const addCarMutation = useMutation({
    mutationFn: (car: Partial<CarType>) => api.createCar(car),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      setIsAddingCar(false);
      setNewCar({
        name: '',
        model_year: new Date().getFullYear(),
        weekly_price: 0,
        bond: 500,
        status: 'Available',
        image: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1600&auto=format&fit=crop'
      });
      showNotification('Vehicle added successfully', 'success');
    },
    onError: () => showNotification('Failed to add vehicle', 'error'),
  });

  const updateCarMutation = useMutation({
    mutationFn: (car: CarType) => api.updateCar(car.id, car),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      setEditingCar(null);
      showNotification('Vehicle updated successfully', 'success');
    },
    onError: () => showNotification('Failed to update vehicle', 'error'),
  });

  const deleteCarMutation = useMutation({
    mutationFn: (id: number) => api.deleteCar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      showNotification('Vehicle deleted successfully', 'success');
    },
    onError: () => showNotification('Failed to delete vehicle', 'error'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number, status: string }) => api.updateApplicationStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      showNotification('Application status updated', 'success');
    },
    onError: () => showNotification('Failed to update status', 'error'),
  });

  const saveAgreementMutation = useMutation({
    mutationFn: (payload: { application_id: number; car_id: number; content: string }) => api.saveLeaseAgreement(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      setIsAgreementModalOpen(false);
      showNotification('Agreement saved successfully', 'success');
    },
    onError: () => showNotification('Failed to save agreement', 'error'),
  });

  const deleteAgreementMutation = useMutation({
    mutationFn: (id: number) => api.deleteSavedLeaseAgreement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showNotification('Agreement deleted successfully', 'success');
    },
    onError: () => showNotification('Failed to delete agreement', 'error'),
  });

  const createMerchantMutation = useMutation({
    mutationFn: (payload: any) => api.createSaasMerchant(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      setIsAddingMerchant(false);
      setNewMerchant({ business_name: '', email: '', country: 'AU', payout_interval: 'weekly' });
      showNotification('Merchant created successfully', 'success');
      if (data.onboarding_link) window.open(data.onboarding_link, '_blank');
    },
    onError: () => showNotification('Failed to create merchant', 'error'),
  });

  const handleLogout = async () => {
    try {
      await api.logoutAdmin();
    } catch (e) {
      console.error('Logout error:', e);
    }
    localStorage.removeItem('admin_token');
    navigate('/admin/login');
  };

  const handleGenerateAgreement = async () => {
    const application_id = Number(selected_agreement_application_id);
    const car_id = Number(selected_agreement_car_id);
    
    if (!application_id || !car_id) {
      showNotification('Please select both an application and a car', 'error');
      return;
    }

    setIsGeneratingAgreement(true);
    try {
      const selectedApplication = applications.find(a => a.id === application_id);
      const selectedCar = cars.find(c => c.id === car_id);

      const payload = {
        agreementDate: new Date().toLocaleDateString('en-AU'),
        renteeName: selectedApplication?.name,
        renteeEmail: selectedApplication?.email,
        renteeContact: selectedApplication?.phone,
        renteeAddress: selectedApplication?.address,
        renteeLicenseNumber: selectedApplication?.license_number,
        vehicleMake: 'Toyota',
        vehicleModel: selectedCar?.name.includes('Camry') ? 'Camry Hybrid' : selectedCar?.name,
        vehicleYear: selectedCar?.model_year.toString(),
        weeklyRent: `$${selectedCar?.weekly_price.toFixed(2)}`,
        rentalStartDate: agreementForm.rentalStartDate,
      };

      const res = await api.renderCarLeaseAgreement(payload);
      setAgreementContent(res.agreement);
      setIsAgreementModalOpen(true);
    } catch (err) {
      showNotification('Failed to generate agreement', 'error');
    } finally {
      setIsGeneratingAgreement(false);
    }
  };

  const approvedApplications = applications.filter(app => app.status === 'Approved' || app.status === 'Paid');

  return (
    <div className="min-h-screen bg-brand-navy flex">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        handleLogout={handleLogout} 
      />

      {/* Main Content */}
      <div className="flex-1 ml-72 p-12 overflow-y-auto min-h-screen">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-white uppercase tracking-tighter mb-2">Dashboard <span className="text-brand-gold italic">Overview</span></h2>
                  <p className="text-brand-grey font-light">Performance metrics and recent activities.</p>
                </div>
                <div className="flex gap-4">
                   <Link to="/admin/financials" className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all">
                    <TrendingUp className="w-4 h-4 text-brand-gold" /> View Detailed Financials
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { label: 'Total Applications', value: stats?.total_applications || 0, icon: Users, color: 'text-blue-500' },
                  { label: 'Active Rentals', value: stats?.active_rentals || 0, icon: Car, color: 'text-green-500' },
                  { label: 'Weekly Revenue', value: `$${stats?.total_weekly_income || 0}`, icon: DollarSign, color: 'text-brand-gold' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 p-8 rounded-3xl relative overflow-hidden group">
                    <div className="relative z-10">
                      <p className="text-[10px] text-brand-grey font-bold uppercase tracking-[0.2em] mb-4">{stat.label}</p>
                      <div className="flex items-baseline gap-4">
                        <h3 className="text-4xl font-bold text-white tracking-tighter">{stat.value}</h3>
                        <stat.icon className={`w-6 h-6 ${stat.color} opacity-50`} />
                      </div>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                      <stat.icon size={120} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                  <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-8 flex items-center gap-3">
                    <Clock className="w-4 h-4 text-brand-gold" /> Pending Applications
                  </h3>
                  <div className="space-y-4">
                    {applications.filter(a => a.status === 'Pending').slice(0, 5).map((app) => (
                      <div key={app.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-brand-gold/10 rounded-full flex items-center justify-center text-brand-gold font-bold text-xs">
                            {app.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{app.name}</p>
                            <p className="text-[10px] text-brand-grey uppercase tracking-widest">{app.uber_status}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setActiveTab('applications')}
                          className="text-brand-gold hover:text-white transition-colors"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    {applications.filter(a => a.status === 'Pending').length === 0 && (
                      <p className="text-center py-8 text-brand-grey text-xs font-light italic">No pending applications</p>
                    )}
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                  <h3 className="text-white font-bold uppercase tracking-widest text-xs mb-8 flex items-center gap-3">
                    <Car className="w-4 h-4 text-brand-gold" /> Fleet Availability
                  </h3>
                  <div className="space-y-4">
                    {cars.slice(0, 5).map((car) => (
                      <div key={car.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                        <div className="flex items-center gap-4">
                          <img src={car.image} alt="" className="w-12 h-8 object-cover rounded-lg" />
                          <div>
                            <p className="text-sm font-bold text-white">{car.name}</p>
                            <p className="text-[10px] text-brand-grey uppercase tracking-widest">{car.model_year} Model</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest border ${
                          car.status === 'Available' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-brand-navy text-brand-grey border-white/10'
                        }`}>
                          {car.status}
                        </span>
                      </div>
                    ))}
                  </div>
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
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-white uppercase tracking-tighter mb-2">Driver <span className="text-brand-gold italic">Applications</span></h2>
                  <p className="text-brand-grey font-light">Manage and review incoming driver requests.</p>
                </div>
                <div className="flex gap-4">
                  <div className="relative">
                    <Search className="w-4 h-4 text-brand-grey absolute left-4 top-1/2 -translate-y-1/2" />
                    <input 
                      placeholder="Search drivers..."
                      className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-6 py-4 text-sm text-white focus:border-brand-gold outline-none transition-all w-64"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Driver</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Experience</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Status</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Date</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {applications.map((app) => (
                      <tr key={app.id} className="hover:bg-white/5 transition-all group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-brand-gold/10 rounded-full flex items-center justify-center text-brand-gold font-bold text-sm">
                              {app.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{app.name}</p>
                              <p className="text-[10px] text-brand-grey">{app.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div>
                            <p className="text-xs text-white">{app.experience}</p>
                            <p className="text-[10px] text-brand-grey uppercase tracking-widest">{app.uber_status}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                            app.status === 'Approved' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                            app.status === 'Paid' ? 'bg-brand-gold/10 text-brand-gold border-brand-gold/20' :
                            app.status === 'Rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                            'bg-brand-navy text-brand-grey border-white/10'
                          }`}>
                            {app.status}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-xs text-brand-grey">
                          {new Date(app.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {app.status === 'Pending' && (
                              <>
                                <button 
                                  onClick={() => updateStatusMutation.mutate({ id: app.id, status: 'Approved' })}
                                  className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500 transition-all hover:text-white"
                                  title="Approve"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => updateStatusMutation.mutate({ id: app.id, status: 'Rejected' })}
                                  className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 transition-all hover:text-white"
                                  title="Reject"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button 
                              className="p-2 bg-white/5 text-brand-grey rounded-lg hover:bg-brand-gold hover:text-brand-navy transition-all"
                              title="View Documents"
                              onClick={() => {
                                if (app.status === 'Approved' || app.status === 'Paid') {
                                  set_selected_agreement_application_id(app.id.toString());
                                  setActiveTab('agreements');
                                } else {
                                  showNotification('Review documents in detail view (TODO)', 'success');
                                }
                              }}
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            {(app.status === 'Approved' || app.status === 'Paid') && (
                                <button 
                                  onClick={() => {
                                    const firstCarId = cars.find(c => c.status === 'Available')?.id || 1;
                                    const link = `${window.location.origin}/checkout/${firstCarId}?application_id=${app.id}`;
                                    navigator.clipboard.writeText(link);
                                    showNotification('Checkout link copied!', 'success');
                                  }}
                                  className="p-2 bg-brand-gold/10 text-brand-gold rounded-lg hover:bg-brand-gold hover:text-brand-navy transition-all"
                                  title="Copy Checkout Link"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                            )}
                          </div>
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
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-white uppercase tracking-tighter mb-2">Fleet <span className="text-brand-gold italic">Management</span></h2>
                  <p className="text-brand-grey font-light">Control and update your vehicle inventory.</p>
                </div>
                <button 
                  onClick={() => setIsAddingCar(true)}
                  className="bg-brand-gold text-brand-navy px-8 py-4 font-bold uppercase tracking-widest text-[10px] hover:bg-brand-gold-light transition-all shadow-lg flex items-center gap-3"
                >
                  <Plus className="w-4 h-4" /> Add New Vehicle
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {cars.map((car) => (
                  <div key={car.id} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden group hover:border-brand-gold/30 transition-all duration-500">
                    <div className="aspect-video relative overflow-hidden">
                      <img src={car.image} alt={car.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      <div className="absolute top-4 right-4 flex gap-2">
                        <span className={`px-4 py-1.5 rounded-full text-[8px] font-bold uppercase tracking-widest backdrop-blur-md border ${
                          car.status === 'Available' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-brand-navy/60 text-brand-grey border-white/10'
                        }`}>
                          {car.status}
                        </span>
                      </div>
                    </div>
                    <div className="p-8">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-white group-hover:text-brand-gold transition-colors">{car.name}</h3>
                          <div className="text-xs text-brand-grey mt-1 font-light">{car.model_year} Model</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Weekly</div>
                          <div className="text-sm font-bold text-white">${car.weekly_price}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-6 border-t border-white/5">
                        <button 
                          onClick={() => setEditingCar(car)}
                          className="flex-1 py-3 bg-white/5 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-brand-gold hover:text-brand-navy hover:border-brand-gold transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this vehicle?')) {
                              deleteCarMutation.mutate(car.id);
                            }
                          }}
                          className="flex-1 py-3 bg-white/5 border border-white/10 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'rentals' && (
            <motion.div
              key="rentals"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-white uppercase tracking-tighter mb-2">Active <span className="text-brand-gold italic">Rentals</span></h2>
                  <p className="text-brand-grey font-light">Monitor current driver subscriptions and vehicle usage.</p>
                </div>
                <div className="flex gap-4">
                  <div className="relative">
                    <Search className="w-4 h-4 text-brand-grey absolute left-4 top-1/2 -translate-y-1/2" />
                    <input 
                      placeholder="Search rentals..."
                      className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-6 py-4 text-sm text-white focus:border-brand-gold outline-none transition-all w-64"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Driver & Vehicle</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Start Date</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Rate</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Status</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rentals.map((rental) => (
                      <tr key={rental.id} className="hover:bg-white/5 transition-all group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold font-bold text-xs">
                              <Car className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{rental.applicant_name}</p>
                              <p className="text-[10px] text-brand-grey uppercase tracking-widest">{rental.car_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-xs text-brand-grey">
                          {new Date(rental.start_date).toLocaleDateString()}
                        </td>
                        <td className="px-8 py-6">
                            <div className="text-sm font-bold text-white">${rental.weekly_price}/wk</div>
                            <div className="text-[8px] text-brand-grey uppercase tracking-widest">Incl. Insurance</div>
                        </td>
                        <td className="px-8 py-6">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                            rental.status === 'Active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                          }`}>
                            {rental.status}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button className="p-2 bg-white/5 text-brand-grey rounded-lg hover:bg-brand-gold hover:text-brand-navy transition-all">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'agreements' && (
            <motion.div
              key="agreements"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-white uppercase tracking-tighter mb-2">Lease <span className="text-brand-gold italic">Agreements</span></h2>
                  <p className="text-brand-grey font-light">Generate and manage legally binding rental contracts.</p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Select Approved Application</label>
                    <select
                      value={selected_agreement_application_id}
                      onChange={(e) => set_selected_agreement_application_id(e.target.value)}
                      className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light appearance-none"
                    >
                      <option value="">Select a driver...</option>
                      {approvedApplications.map(app => (
                        <option key={app.id} value={app.id}>{app.name} ({app.email})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Select Assigned Vehicle</label>
                    <select
                      value={selected_agreement_car_id}
                      onChange={(e) => set_selected_agreement_car_id(e.target.value)}
                      className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light appearance-none"
                    >
                      <option value="">Select a car...</option>
                      {cars.map(car => (
                        <option key={car.id} value={car.id}>
                          {car.name} ({car.model_year})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button 
                    disabled={isGeneratingAgreement || !selected_agreement_application_id || !selected_agreement_car_id}
                    onClick={handleGenerateAgreement}
                    className="bg-brand-gold text-brand-navy h-[58px] font-bold uppercase tracking-widest text-[10px] hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isGeneratingAgreement ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Generate New Agreement
                  </button>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Agreement ID</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Driver & Vehicle</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest">Generated On</th>
                      <th className="px-8 py-6 text-[10px] font-bold text-brand-grey uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {savedAgreements.map((agreement: any) => (
                      <tr key={agreement.id} className="hover:bg-white/5 transition-all group">
                        <td className="px-8 py-6 text-xs text-brand-gold font-bold">
                          #{agreement.id.toString().padStart(6, '0')}
                        </td>
                        <td className="px-8 py-6">
                          <div>
                            <p className="text-sm font-bold text-white">{agreement.applicant_name}</p>
                            <p className="text-[10px] text-brand-grey uppercase tracking-widest">{agreement.car_name}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-xs text-brand-grey">
                          {new Date(agreement.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              className="p-2 bg-white/5 text-brand-grey rounded-lg hover:bg-brand-gold hover:text-brand-navy transition-all"
                              onClick={() => {
                                setAgreementContent(agreement.content);
                                setIsAgreementModalOpen(true);
                              }}
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button 
                              className="p-2 bg-white/5 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                              onClick={() => {
                                if (confirm('Delete this agreement?')) {
                                  deleteAgreementMutation.mutate(agreement.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {savedAgreements.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-brand-grey text-xs font-light italic">No agreements generated yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'saas' && (
            <motion.div
              key="saas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-white uppercase tracking-tighter mb-2">SaaS <span className="text-brand-gold italic">Clients</span></h2>
                  <p className="text-brand-grey font-light">Onboard other rental businesses to use Maple infrastructure.</p>
                </div>
                <button 
                  onClick={() => setIsAddingMerchant(true)}
                  className="bg-brand-gold text-brand-navy px-8 py-4 font-bold uppercase tracking-widest text-[10px] hover:bg-brand-gold-light transition-all shadow-lg flex items-center gap-3"
                >
                  <Plus className="w-4 h-4" /> New Merchant Onboarding
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {merchants.map((merchant) => (
                  <div key={merchant.id} className="bg-white/5 border border-white/10 p-8 rounded-3xl relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 group-hover:border-brand-gold/30 transition-all">
                        <Building2 className="w-6 h-6 text-brand-gold" />
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest border ${
                        merchant.onboarding_status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-brand-navy text-brand-grey border-white/10'
                      }`}>
                        {merchant.onboarding_status}
                      </span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-white mb-1">{merchant.name}</h3>
                    <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-6">{merchant.email}</p>
                    
                    <div className="space-y-3 mb-8">
                      <div className="flex items-center gap-3 text-xs text-brand-grey">
                        <Globe className="w-3.5 h-3.5 text-brand-gold/50" />
                        <span>Region: {merchant.country}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-brand-grey">
                        <DollarSign className="w-3.5 h-3.5 text-brand-gold/50" />
                        <span>Payout: {merchant.payout_interval}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-brand-grey">
                        <ShieldCheck className="w-3.5 h-3.5 text-brand-gold/50" />
                        <span className="truncate">Stripe: {merchant.stripe_account_id}</span>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-white/5">
                      <button 
                        onClick={() => {
                           api.refreshSaasAccountLink(merchant.id).then(res => {
                             if (res.onboarding_link) window.open(res.onboarding_link, '_blank');
                           }).catch(() => showNotification('Failed to generate link', 'error'));
                        }}
                        className="w-full py-3 bg-white/5 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-brand-gold hover:text-brand-navy hover:border-brand-gold transition-all"
                      >
                        Launch Dashboard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-12 left-1/2 z-50 px-8 py-5 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[300px] border ${
              notification.type === 'success' ? 'bg-green-500 border-green-400 text-white' : 'bg-red-500 border-red-400 text-white'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="text-xs font-bold uppercase tracking-widest">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Car Modal */}
      <AnimatePresence>
        {(isAddingCar || editingCar) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-xl bg-brand-navy/60">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-brand-navy border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold text-white uppercase tracking-tighter">
                  {editingCar ? 'Edit Vehicle' : 'Add New Vehicle'}
                </h3>
                <button 
                  onClick={() => { setIsAddingCar(false); setEditingCar(null); }}
                  className="p-2 hover:bg-white/5 rounded-full transition-all text-brand-grey hover:text-white"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="p-12 space-y-8">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Model Name</label>
                    <input 
                      value={editingCar ? editingCar.name : newCar.name}
                      onChange={(e) => editingCar ? setEditingCar({...editingCar, name: e.target.value}) : setNewCar({...newCar, name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Weekly Rental (AUD)</label>
                    <input 
                      type="number"
                      value={editingCar ? editingCar.weekly_price : newCar.weekly_price}
                      onChange={(e) => editingCar ? setEditingCar({...editingCar, weekly_price: Number(e.target.value)}) : setNewCar({...newCar, weekly_price: Number(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Model Year</label>
                    <input 
                      type="number"
                      value={editingCar ? editingCar.model_year : newCar.model_year}
                      onChange={(e) => editingCar ? setEditingCar({...editingCar, model_year: Number(e.target.value)}) : setNewCar({...newCar, model_year: Number(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Security Bond (AUD)</label>
                    <input 
                      type="number"
                      value={editingCar ? editingCar.bond : newCar.bond}
                      onChange={(e) => editingCar ? setEditingCar({...editingCar, bond: Number(e.target.value)}) : setNewCar({...newCar, bond: Number(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Vehicle Image URL</label>
                  <input 
                    value={editingCar ? editingCar.image : newCar.image}
                    onChange={(e) => editingCar ? setEditingCar({...editingCar, image: e.target.value}) : setNewCar({...newCar, image: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                  />
                </div>
                <button 
                  onClick={() => {
                    if (editingCar) {
                      updateCarMutation.mutate(editingCar);
                    } else {
                      addCarMutation.mutate(newCar);
                    }
                  }}
                  disabled={addCarMutation.isPending || updateCarMutation.isPending}
                  className="w-full bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {addCarMutation.isPending || updateCarMutation.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  {editingCar ? 'Update Vehicle' : 'Add Vehicle to Fleet'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SaaS Modal */}
      <AnimatePresence>
        {isAddingMerchant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-xl bg-brand-navy/60">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-brand-navy border border-white/10 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold text-white uppercase tracking-tighter">New SaaS Merchant</h3>
                <button onClick={() => setIsAddingMerchant(false)} className="text-brand-grey hover:text-white"><XCircle /></button>
              </div>
              <div className="p-12 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Business Name</label>
                  <input 
                    value={newMerchant.business_name}
                    onChange={(e) => setNewMerchant({...newMerchant, business_name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                    placeholder="e.g. Sydney Hybrid Rentals"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Business Email</label>
                  <input 
                    type="email"
                    value={newMerchant.email}
                    onChange={(e) => setNewMerchant({...newMerchant, email: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none transition-all font-light"
                    placeholder="admin@merchant.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Country</label>
                    <select 
                      value={newMerchant.country}
                      onChange={(e) => setNewMerchant({...newMerchant, country: e.target.value})}
                      className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none appearance-none"
                    >
                      <option value="AU">Australia</option>
                      <option value="NZ">New Zealand</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Payout Schedule</label>
                    <select 
                      value={newMerchant.payout_interval}
                      onChange={(e) => setNewMerchant({...newMerchant, payout_interval: e.target.value as any})}
                      className="w-full bg-brand-navy border border-white/10 rounded-xl px-5 py-4 text-white focus:border-brand-gold outline-none appearance-none"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => createMerchantMutation.mutate(newMerchant)}
                  disabled={createMerchantMutation.isPending}
                  className="w-full bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-sm hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {createMerchantMutation.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                  Register & Create Stripe Express Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Agreement Modal */}
      <AnimatePresence>
        {isAgreementModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-xl bg-brand-navy/60">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-brand-navy border border-white/10 w-full max-w-4xl h-[80vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Review Lease Agreement</h3>
                  <p className="text-[10px] text-brand-grey uppercase tracking-widest mt-1">Legally binding Markdown contract</p>
                </div>
                <button onClick={() => setIsAgreementModalOpen(false)} className="text-brand-grey hover:text-white p-2 bg-white/5 rounded-full"><XCircle /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 bg-white/[0.02]">
                <div className="prose prose-invert prose-brand max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-brand-grey bg-brand-navy/50 p-8 border border-white/10 rounded-2xl">
                    {agreementContent}
                  </pre>
                </div>
              </div>
              <div className="p-8 border-t border-white/10 bg-white/5 flex gap-4">
                <button 
                  onClick={() => setIsAgreementModalOpen(false)}
                  className="flex-1 py-5 border border-white/10 text-white font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
                >
                  Discard
                </button>
                <button 
                  onClick={() => {
                    const application_id = Number(selected_agreement_application_id);
                    const car_id = Number(selected_agreement_car_id);
                    if (application_id && car_id) {
                      saveAgreementMutation.mutate({
                        application_id,
                        car_id,
                        content: agreementContent
                      });
                    }
                  }}
                  disabled={saveAgreementMutation.isPending}
                  className="flex-[2] bg-brand-gold text-brand-navy py-5 font-bold uppercase tracking-widest text-xs hover:bg-brand-gold-light transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {saveAgreementMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  Finalize & Save Agreement
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

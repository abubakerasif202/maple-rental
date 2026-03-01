import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Car, Calendar, DollarSign, Plus, Edit, Trash2, Users, FileText, CheckCircle, XCircle, Download, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import { Car as CarType, Application, Rental, DashboardStats } from '../types';

type LeaseAgreementForm = {
  agreementDate: string;
  registeredOwnerName: string;
  registeredOwnerAddress: string;
  registeredOwnerContact: string;
  registeredOwnerEmail: string;
  renteeName: string;
  renteeDob: string;
  renteeLicenseNumber: string;
  renteeLicenseState: string;
  renteeAddress: string;
  renteeContact: string;
  renteeEmail: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleVin: string;
  kmAllowance: string;
  weeklyRent: string;
  fuelPolicy: string;
  insuranceCoverage: string;
  rentalStartDate: string;
  rentalEndDate: string;
  minimumRentalPeriod: string;
  returnPolicy: string;
};

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
  const [agreementForm, setAgreementForm] = useState<LeaseAgreementForm>({
    agreementDate: '04/04/2024',
    registeredOwnerName: 'MAPLE RENT',
    registeredOwnerAddress: 'Unit 13, Merrylands NSW 2160, AU',
    registeredOwnerContact: '+61 420 550 556',
    registeredOwnerEmail: 'sarfarazrajabi5@yahoo.com',
    renteeName: 'Mohammad Ali Alizadah',
    renteeDob: '21/12/1990',
    renteeLicenseNumber: '21357495',
    renteeLicenseState: 'NSW',
    renteeAddress: '29 Baker Street, Merrylands NSW 2160, Australia',
    renteeContact: '0412230293',
    renteeEmail: 'jalil_alizadah@yahoo.com',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry Hybrid',
    vehicleYear: '2014',
    vehicleVin: 'TBD',
    kmAllowance: 'As agreed in booking',
    weeklyRent: '$249.00 per week (plus GST)',
    fuelPolicy: 'Rentee must pay fuel usage. Extra amount may be added to excess according to age.',
    insuranceCoverage: 'Insurance coverage applies only in New South Wales.',
    rentalStartDate: '2024-04-22',
    rentalEndDate: 'Open-ended',
    minimumRentalPeriod: 'Minimum 6 weeks',
    returnPolicy: 'Car must be full of fuel on return. Failure incurs $20 + fuel cost per liter. Two weeks notice is required before return.',
  });
  const [generatedAgreement, setGeneratedAgreement] = useState('');
  const [selectedAgreementApplicationId, setSelectedAgreementApplicationId] = useState<string>('');
  const [selectedAgreementCarId, setSelectedAgreementCarId] = useState<string>('');
  const [viewingAgreement, setViewingAgreement] = useState<api.SavedLeaseAgreement | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
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
    enabled: activeTab === 'cars' || activeTab === 'dashboard' || activeTab === 'agreements',
  });

  const { data: applications = [] as Application[], isLoading: isLoadingApplications } = useQuery({
    queryKey: ['applications'],
    queryFn: api.fetchApplications,
    enabled: activeTab === 'applications' || activeTab === 'dashboard' || activeTab === 'agreements',
  });

  const { data: rentals = [] as Rental[], isLoading: isLoadingRentals } = useQuery({
    queryKey: ['rentals'],
    queryFn: api.fetchRentals,
    enabled: activeTab === 'rentals' || activeTab === 'dashboard',
  });

  const { data: weeklyFinancials, isLoading: isLoadingFinancials } = useQuery({
    queryKey: ['weekly-financials'],
    queryFn: api.fetchWeeklyFinancials,
    enabled: activeTab === 'dashboard',
  });

  const { data: savedAgreements = [] as api.SavedLeaseAgreement[], isLoading: isLoadingSavedAgreements } = useQuery({
    queryKey: ['saved-agreements'],
    queryFn: api.fetchSavedLeaseAgreements,
    enabled: activeTab === 'agreements',
  });

  const { data: stripeLeaseSettings, isLoading: isLoadingStripeLeaseSettings } = useQuery({
    queryKey: ['stripe-lease-settings'],
    queryFn: api.fetchStripeLeaseSettings,
    enabled: activeTab === 'agreements',
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

  const renderAgreementMutation = useMutation({
    mutationFn: (payload: api.LeaseAgreementPayload) => api.renderCarLeaseAgreement(payload),
    onSuccess: (data) => {
      setGeneratedAgreement(data.agreement);
      showNotification('Agreement generated');
    },
    onError: () => showNotification('Failed to generate agreement', 'error'),
  });

  const saveAgreementMutation = useMutation({
    mutationFn: (payload: { applicationId: number; carId: number; content: string }) => api.saveLeaseAgreement(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-agreements'] });
      showNotification('Agreement saved to database');
    },
    onError: () => showNotification('Failed to save agreement', 'error'),
  });

  const deleteAgreementMutation = useMutation({
    mutationFn: (id: number) => api.deleteSavedLeaseAgreement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-agreements'] });
      showNotification('Agreement deleted');
    },
    onError: () => showNotification('Failed to delete agreement', 'error'),
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

  const handleAgreementFieldChange = (field: keyof LeaseAgreementForm, value: string) => {
    setAgreementForm((prev) => ({ ...prev, [field]: value }));
  };

  const generateAgreement = async () => {
    renderAgreementMutation.mutate(agreementForm);
  };

  const handleSaveAgreement = () => {
    if (!generatedAgreement.trim()) {
      showNotification('No agreement to save', 'error');
      return;
    }
    const applicationId = Number(selectedAgreementApplicationId);
    const carId = Number(selectedAgreementCarId);

    if (!applicationId || !carId) {
      showNotification('Select an application and car before saving', 'error');
      return;
    }

    saveAgreementMutation.mutate({
      applicationId,
      carId,
      content: generatedAgreement
    });
  };

  const deleteAgreement = (id: number) => {
    if (confirm('Are you sure you want to delete this saved agreement?')) {
      deleteAgreementMutation.mutate(id);
    }
  };

  const loadDefaultAgreement = async () => {
    try {
      const text = await api.fetchCarLeaseTemplate();
      setGeneratedAgreement(text);
      showNotification('Default template loaded');
    } catch {
      showNotification('Failed to load template', 'error');
    }
  };

  const copyAgreement = async () => {
    if (!generatedAgreement.trim()) {
      showNotification('No agreement to copy', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedAgreement);
      showNotification('Agreement copied');
    } catch {
      showNotification('Clipboard copy failed', 'error');
    }
  };

  const downloadAgreement = () => {
    if (!generatedAgreement.trim()) {
      showNotification('No agreement to download', 'error');
      return;
    }
    const blob = new Blob([generatedAgreement], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `car-lease-agreement-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const approvedApplications = useMemo(
    () => applications.filter((app) => app.status === 'Approved'),
    [applications]
  );

  const applySelectionToAgreement = () => {
    const applicationId = Number(selectedAgreementApplicationId);
    const carId = Number(selectedAgreementCarId);
    const selectedApplication = approvedApplications.find((app) => app.id === applicationId);
    const selectedCar = cars.find((car) => car.id === carId);

    if (!selectedApplication && !selectedCar) {
      showNotification('Select an application or car to auto fill', 'error');
      return;
    }

    const intendedStartDate = selectedApplication?.intendedStartDate
      ? String(selectedApplication.intendedStartDate).slice(0, 10)
      : agreementForm.rentalStartDate;

    const nameParts = selectedCar?.name?.trim().split(/\s+/) || [];
    const vehicleMake = nameParts.length > 0 ? nameParts[0] : agreementForm.vehicleMake;
    const vehicleModel =
      nameParts.length > 1 ? nameParts.slice(1).join(' ') : agreementForm.vehicleModel;

    const nextForm: LeaseAgreementForm = {
      ...agreementForm,
      renteeName: selectedApplication?.name || agreementForm.renteeName,
      renteeLicenseNumber: selectedApplication?.licenseNumber || agreementForm.renteeLicenseNumber,
      renteeAddress: selectedApplication?.address || agreementForm.renteeAddress,
      renteeContact: selectedApplication?.phone || agreementForm.renteeContact,
      renteeEmail: selectedApplication?.email || agreementForm.renteeEmail,
      rentalStartDate: intendedStartDate,
      vehicleMake,
      vehicleModel,
      vehicleYear: selectedCar?.modelYear ? String(selectedCar.modelYear) : agreementForm.vehicleYear,
      weeklyRent: selectedCar ? `$${Number(selectedCar.weeklyPrice).toFixed(2)} per week (plus GST)` : agreementForm.weeklyRent,
    };

    setAgreementForm((prev) => ({
      ...prev,
      ...nextForm,
    }));

    renderAgreementMutation.mutate(nextForm);
    showNotification('Agreement fields auto-filled');
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
            { id: 'agreements', icon: FileText, label: 'Lease Agreement' },
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

              {/* Weekly Financial Overview */}
              <div className="mb-12">
                <h2 className="text-xl font-serif font-bold mb-8 tracking-tight">Weekly Financial Overview (Last 7 Days)</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Projected vs Actual Card */}
                  <div className="bg-brand-navy-light border border-white/10 p-10 shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-start mb-10">
                      <div>
                        <h3 className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em] mb-2">Projected vs. Actual</h3>
                        <p className="text-sm text-brand-grey font-light">Comparison of database rental expectations vs. Stripe bank payouts.</p>
                      </div>
                      <DollarSign className="w-8 h-8 text-brand-gold/20" />
                    </div>

                    <div className="grid grid-cols-2 gap-10">
                      <div>
                        <p className="text-[10px] font-bold text-brand-grey uppercase tracking-widest mb-3">Projected Gross</p>
                        <p className="text-3xl font-bold text-white">
                          {isLoadingFinancials ? '...' : `$${weeklyFinancials?.projectedGrossWeekly.toLocaleString()}`}
                        </p>
                        <p className="text-[10px] text-brand-grey mt-2 italic font-light">Est. Net: ${weeklyFinancials?.projectedNetWeekly.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-3">Actual Payouts</p>
                        <p className="text-3xl font-bold text-emerald-500">
                          {isLoadingFinancials ? '...' : `$${weeklyFinancials?.actualPayoutsWeekly.toLocaleString()}`}
                        </p>
                        <p className="text-[10px] text-brand-grey mt-2 italic font-light">Received in bank</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-10 h-1 bg-white/5 relative">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: weeklyFinancials ? `${Math.min((weeklyFinancials.actualPayoutsWeekly / weeklyFinancials.projectedNetWeekly) * 100, 100)}%` : 0 }}
                        className="absolute top-0 left-0 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                      />
                    </div>
                  </div>

                  {/* Recent Payouts Table */}
                  <div className="bg-brand-navy-light border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-8 border-b border-white/10 flex items-center justify-between">
                      <h3 className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Recent Stripe Payouts</h3>
                      <span className="text-[10px] text-brand-grey font-light uppercase tracking-widest">Live from Stripe</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-white/5">
                        <thead className="bg-white/2">
                          <tr>
                            <th className="px-8 py-4 text-left text-[8px] font-bold text-brand-grey uppercase tracking-widest">Date</th>
                            <th className="px-8 py-4 text-left text-[8px] font-bold text-brand-grey uppercase tracking-widest">Amount</th>
                            <th className="px-8 py-4 text-right text-[8px] font-bold text-brand-grey uppercase tracking-widest">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {isLoadingFinancials ? (
                            <tr><td colSpan={3} className="px-8 py-6 text-center text-[10px] text-brand-grey uppercase tracking-widest italic">Syncing Stripe data...</td></tr>
                          ) : weeklyFinancials?.recentPayouts.length === 0 ? (
                            <tr><td colSpan={3} className="px-8 py-6 text-center text-[10px] text-brand-grey uppercase tracking-widest italic">No recent payouts found</td></tr>
                          ) : (
                            weeklyFinancials?.recentPayouts.map((payout) => (
                              <tr key={payout.id} className="hover:bg-white/2 transition-colors">
                                <td className="px-8 py-4 text-[10px] font-medium text-white">{payout.arrivalDate}</td>
                                <td className="px-8 py-4 text-[10px] font-bold text-white">${payout.amount.toLocaleString()}</td>
                                <td className="px-8 py-4 text-right">
                                  <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${
                                    payout.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 
                                    payout.status === 'pending' ? 'bg-brand-gold/10 text-brand-gold' : 
                                    'bg-brand-grey/10 text-brand-grey'
                                  }`}>
                                    {payout.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
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
                            <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full ${app.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-500' :
                              app.status === 'Rejected' ? 'bg-red-500/10 text-red-500' :
                                'bg-brand-gold/10 text-brand-gold'
                              }`}>
                              {app.status}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-right flex items-center justify-end gap-3">
                            {app.status === 'Approved' && (
                              <button
                                onClick={() => {
                                  // Find first available car or default to 1
                                  const firstCarId = cars.find(c => c.status === 'Available')?.id || 1;
                                  const link = `${window.location.origin}/checkout/${firstCarId}?applicationId=${app.id}`;
                                  navigator.clipboard.writeText(link);
                                  showNotification('Checkout link copied');
                                }}
                                className="text-brand-gold hover:text-white transition-colors flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest"
                                title="Copy Checkout Link"
                              >
                                <Copy className="w-3 h-3" /> Link
                              </button>
                            )}
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

          {activeTab === 'agreements' && (
            <motion.div
              key="agreements"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <h1 className="text-3xl font-serif font-bold tracking-tight">Lease Agreement Builder</h1>
                <div className="flex gap-3">
                  <button
                    onClick={loadDefaultAgreement}
                    className="px-5 py-3 text-xs font-bold uppercase tracking-widest border border-white/20 text-brand-grey hover:text-white hover:border-white/40 transition-colors"
                  >
                    Load Template
                  </button>
                  <button
                    onClick={handleSaveAgreement}
                    disabled={saveAgreementMutation.isPending}
                    className="px-5 py-3 text-xs font-bold uppercase tracking-widest border border-brand-gold/30 text-brand-gold hover:bg-brand-gold/5 transition-colors flex items-center gap-2"
                  >
                    {saveAgreementMutation.isPending ? 'Saving...' : 'Save to Database'}
                  </button>
                  <button
                    onClick={generateAgreement}
                    className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-lg"
                  >
                    Generate Agreement
                  </button>
                </div>
              </div>

              <div className="bg-brand-navy-light border border-white/10 p-6 shadow-2xl mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Approved Application</label>
                    <select
                      value={selectedAgreementApplicationId}
                      onChange={(e) => setSelectedAgreementApplicationId(e.target.value)}
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold"
                    >
                      <option value="">Select approved application</option>
                      {approvedApplications.map((app) => (
                        <option key={app.id} value={app.id}>
                          {app.name} ({app.email})
                        </option>
                      ))}
                    </select>
                    {isLoadingApplications && <p className="text-[10px] text-brand-grey">Loading applications...</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Vehicle</label>
                    <select
                      value={selectedAgreementCarId}
                      onChange={(e) => setSelectedAgreementCarId(e.target.value)}
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold"
                    >
                      <option value="">Select vehicle</option>
                      {cars.map((car) => (
                        <option key={car.id} value={car.id}>
                          {car.name} ({car.modelYear})
                        </option>
                      ))}
                    </select>
                    {isLoadingCars && <p className="text-[10px] text-brand-grey">Loading cars...</p>}
                  </div>
                  <button
                    onClick={applySelectionToAgreement}
                    className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-lg h-[46px]"
                  >
                    Auto Fill
                  </button>
                </div>
              </div>

              <div className="bg-brand-navy-light border border-white/10 p-6 shadow-2xl mb-8">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-brand-gold mb-4">Stripe Lease Billing Settings</h2>
                {isLoadingStripeLeaseSettings ? (
                  <p className="text-sm text-brand-grey">Loading Stripe settings...</p>
                ) : stripeLeaseSettings ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
                    <div className="bg-brand-navy border border-white/10 p-4">
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Currency</p>
                      <p className="font-bold text-white">{stripeLeaseSettings.currency}</p>
                    </div>
                    <div className="bg-brand-navy border border-white/10 p-4">
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Recurring Interval</p>
                      <p className="font-bold text-white">{stripeLeaseSettings.recurringInterval}</p>
                    </div>
                    <div className="bg-brand-navy border border-white/10 p-4">
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Minimum Rental</p>
                      <p className="font-bold text-white">{stripeLeaseSettings.minimumRentalWeeks} weeks</p>
                    </div>
                    <div className="bg-brand-navy border border-white/10 p-4">
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Coverage Region</p>
                      <p className="font-bold text-white">{stripeLeaseSettings.insuranceCoverageRegion}</p>
                    </div>
                    <div className="bg-brand-navy border border-white/10 p-4">
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Account Mgmt / Week</p>
                      <p className="font-bold text-white">${stripeLeaseSettings.fees.accountManagementWeekly.toFixed(2)}</p>
                    </div>
                    <div className="bg-brand-navy border border-white/10 p-4">
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">New Account Setup</p>
                      <p className="font-bold text-white">${stripeLeaseSettings.fees.newAccountSetup.toFixed(2)}</p>
                    </div>
                    <div className="bg-brand-navy border border-white/10 p-4">
                      <p className="text-[10px] text-brand-grey uppercase tracking-widest mb-1">Direct Debit Setup</p>
                      <p className="font-bold text-white">${stripeLeaseSettings.fees.directDebitAccountSetup.toFixed(2)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-400">Stripe settings unavailable.</p>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="bg-brand-navy-light border border-white/10 p-8 shadow-2xl space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Agreement Date</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.agreementDate} onChange={(e) => handleAgreementFieldChange('agreementDate', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Owner Name</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.registeredOwnerName} onChange={(e) => handleAgreementFieldChange('registeredOwnerName', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Owner Contact</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.registeredOwnerContact} onChange={(e) => handleAgreementFieldChange('registeredOwnerContact', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Owner Address</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.registeredOwnerAddress} onChange={(e) => handleAgreementFieldChange('registeredOwnerAddress', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Owner Email</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.registeredOwnerEmail} onChange={(e) => handleAgreementFieldChange('registeredOwnerEmail', e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rentee Name</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.renteeName} onChange={(e) => handleAgreementFieldChange('renteeName', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rentee DOB</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.renteeDob} onChange={(e) => handleAgreementFieldChange('renteeDob', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">License Number</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.renteeLicenseNumber} onChange={(e) => handleAgreementFieldChange('renteeLicenseNumber', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">License State</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.renteeLicenseState} onChange={(e) => handleAgreementFieldChange('renteeLicenseState', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rentee Address</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.renteeAddress} onChange={(e) => handleAgreementFieldChange('renteeAddress', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rentee Contact</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.renteeContact} onChange={(e) => handleAgreementFieldChange('renteeContact', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rentee Email</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.renteeEmail} onChange={(e) => handleAgreementFieldChange('renteeEmail', e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Vehicle Make</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.vehicleMake} onChange={(e) => handleAgreementFieldChange('vehicleMake', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Vehicle Model</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.vehicleModel} onChange={(e) => handleAgreementFieldChange('vehicleModel', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Vehicle Year</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.vehicleYear} onChange={(e) => handleAgreementFieldChange('vehicleYear', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Vehicle VIN</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.vehicleVin} onChange={(e) => handleAgreementFieldChange('vehicleVin', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">KM Allowance</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.kmAllowance} onChange={(e) => handleAgreementFieldChange('kmAllowance', e.target.value)} />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Weekly Rent</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.weeklyRent} onChange={(e) => handleAgreementFieldChange('weeklyRent', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Fuel Policy</label>
                      <textarea rows={3} className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold resize-y" value={agreementForm.fuelPolicy} onChange={(e) => handleAgreementFieldChange('fuelPolicy', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Insurance Coverage</label>
                      <textarea rows={2} className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold resize-y" value={agreementForm.insuranceCoverage} onChange={(e) => handleAgreementFieldChange('insuranceCoverage', e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rental Start Date</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.rentalStartDate} onChange={(e) => handleAgreementFieldChange('rentalStartDate', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Rental End Date</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.rentalEndDate} onChange={(e) => handleAgreementFieldChange('rentalEndDate', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Minimum Rental Period</label>
                      <input className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold" value={agreementForm.minimumRentalPeriod} onChange={(e) => handleAgreementFieldChange('minimumRentalPeriod', e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Return Policy</label>
                      <textarea rows={4} className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white outline-none focus:border-brand-gold resize-y" value={agreementForm.returnPolicy} onChange={(e) => handleAgreementFieldChange('returnPolicy', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="bg-brand-navy-light border border-white/10 p-8 shadow-2xl flex flex-col min-h-[600px]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-serif font-bold">Generated Agreement</h2>
                    <div className="flex items-center gap-2">
                      <button onClick={copyAgreement} className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-white/20 text-brand-grey hover:text-white hover:border-white/40 transition-colors flex items-center gap-2">
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                      <button onClick={downloadAgreement} className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-white/20 text-brand-grey hover:text-white hover:border-white/40 transition-colors flex items-center gap-2">
                        <Download className="w-3 h-3" /> Download
                      </button>
                    </div>
                  </div>

                  <textarea
                    readOnly
                    value={generatedAgreement || (renderAgreementMutation.isPending ? 'Generating agreement...' : '')}
                    className="flex-1 min-h-[520px] bg-brand-navy border border-white/10 p-4 text-sm text-white font-mono leading-relaxed outline-none resize-none"
                    placeholder="Generate an agreement to preview it here."
                  />
                </div>
              </div>

              <div className="mt-12">
                <h2 className="text-xl font-serif font-bold mb-6 tracking-tight">Saved Agreements History</h2>
                <div className="bg-brand-navy-light border border-white/10 overflow-hidden shadow-2xl">
                  <table className="min-w-full divide-y divide-white/10">
                    <thead className="bg-brand-navy/50">
                      <tr>
                        <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Applicant</th>
                        <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Vehicle</th>
                        <th className="px-8 py-6 text-left text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Saved On</th>
                        <th className="px-8 py-6 text-right text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {isLoadingSavedAgreements ? (
                        <tr>
                          <td colSpan={4} className="px-8 py-12 text-center text-brand-grey text-sm">Loading history...</td>
                        </tr>
                      ) : savedAgreements.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-8 py-12 text-center text-brand-grey text-sm">No saved agreements found</td>
                        </tr>
                      ) : (
                        savedAgreements.map((agreement) => (
                          <tr key={agreement.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-8 py-6 text-sm font-bold text-white">{agreement.applicantName}</td>
                            <td className="px-8 py-6 text-sm text-brand-grey font-light">{agreement.carName}</td>
                            <td className="px-8 py-6 text-sm text-brand-grey font-light">{new Date(agreement.createdAt).toLocaleDateString()}</td>
                            <td className="px-8 py-6 text-right">
                              <button
                                onClick={() => {
                                  setViewingAgreement(agreement);
                                  setIsViewModalOpen(true);
                                }}
                                className="text-brand-gold hover:text-brand-gold-light text-[10px] font-bold uppercase tracking-widest mr-6"
                              >
                                View
                              </button>
                              <button onClick={() => deleteAgreement(agreement.id)} className="text-brand-grey hover:text-red-500 transition-colors">
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
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
                      onChange={(e) => setEditingCar({ ...editingCar, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Weekly Rate ($)</label>
                    <input
                      type="number"
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.weeklyPrice}
                      onChange={(e) => setEditingCar({ ...editingCar, weeklyPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Model Year</label>
                    <input
                      type="number"
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.modelYear}
                      onChange={(e) => setEditingCar({ ...editingCar, modelYear: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Bond ($)</label>
                    <input
                      type="number"
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.bond}
                      onChange={(e) => setEditingCar({ ...editingCar, bond: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Image URL</label>
                    <input
                      type="url"
                      required
                      className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                      value={editingCar.image}
                      onChange={(e) => setEditingCar({ ...editingCar, image: e.target.value })}
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
                    onChange={(e) => setEditingCar({ ...editingCar, status: e.target.value as "Available" | "Rented" | "Maintenance" })}
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
                      onChange={(e) => setNewCar({ ...newCar, name: e.target.value })}
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
                      onChange={(e) => setNewCar({ ...newCar, weeklyPrice: Number(e.target.value) })}
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
                      onChange={(e) => setNewCar({ ...newCar, modelYear: Number(e.target.value) })}
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
                      onChange={(e) => setNewCar({ ...newCar, bond: Number(e.target.value) })}
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
                      onChange={(e) => setNewCar({ ...newCar, image: e.target.value })}
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
                    onChange={(e) => setNewCar({ ...newCar, status: e.target.value as "Available" | "Rented" | "Maintenance" })}
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

        {/* View Agreement Modal */}
        {isViewModalOpen && viewingAgreement && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-brand-navy-light border border-brand-gold/30 p-10 max-w-4xl w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-white tracking-tight">Lease Agreement Record</h2>
                  <p className="text-[10px] text-brand-gold font-bold uppercase tracking-widest mt-1">
                    {viewingAgreement.applicantName} • {viewingAgreement.carName} • {new Date(viewingAgreement.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    setViewingAgreement(null);
                  }}
                  className="text-brand-grey hover:text-white transition-colors"
                >
                  <XCircle className="w-8 h-8" />
                </button>
              </div>

              <div className="bg-brand-navy border border-white/10 p-8 text-sm text-white font-mono leading-relaxed whitespace-pre-wrap">
                {viewingAgreement.content}
              </div>

              <div className="flex justify-end gap-5 mt-12 pt-8 border-t border-white/10">
                <button
                  onClick={() => {
                    const blob = new Blob([viewingAgreement.content], { type: 'text/markdown;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `car-lease-${viewingAgreement.applicantName}-${new Date(viewingAgreement.createdAt).toISOString().slice(0, 10)}.md`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                  }}
                  className="bg-brand-gold hover:bg-brand-gold-light text-brand-navy px-10 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Markdown
                </button>
              </div>
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
            className={`fixed bottom-8 right-8 px-6 py-4 shadow-2xl flex items-center gap-3 z-[100] border ${notification.type === 'error'
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

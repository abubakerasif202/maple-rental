import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  Toast,
  ToastTitle,
  useToastController,
} from '@fluentui/react-components';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Search,
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
  Car,
  Users,
  Mail,
  Phone,
  MapPin,
  BadgeCheck,
  Menu,
  Archive,
  RotateCcw
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import OverviewTab from '../components/admin/tabs/OverviewTab';
import ApplicationsTab from '../components/admin/tabs/ApplicationsTab';
import FleetTab from '../components/admin/tabs/FleetTab';
import RentalsTab from '../components/admin/tabs/RentalsTab';
import FinancialsTab from '../components/admin/tabs/FinancialsTab';
import CustomersTab from '../components/admin/tabs/CustomersTab';
import InvoicesTab from '../components/admin/tabs/InvoicesTab';
import AgreementsTab from '../components/admin/tabs/AgreementsTab';
import TollStatDecTab from '../components/admin/tabs/TollStatDecTab';
import MaintenanceTab from '../components/admin/tabs/MaintenanceTab';
import {
  getDateRangeForPreset,
  type DateRangeValue,
} from '../components/admin/DateRangePicker';
import VehicleFormModal from '../components/admin/vehicles/VehicleFormModal';
import VehicleActionDialog from '../components/admin/vehicles/VehicleActionDialog';

import * as api from '../lib/api';
import { getApiErrorMessage } from '../lib/errorHandling';
import { uploadVehicleImage } from '../lib/vehicleImageStorage';
import {
  Car as CarType,
  Application,
  Rental,
  DashboardStats,
  AdminDatasetResponse,
  OperationalCustomer,
  OperationalInvoice,
} from '../types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/admin/Sidebar';
import { getTodayInAustralia } from '../../shared/applicationSubmission';
import type { VehicleDialogMode, VehicleFormValues } from '../components/admin/vehicles/types';

const OPERATIONAL_PAGE_SIZE = 25;
const DEFAULT_VEHICLE_IMAGE = '/hero-camry.webp';

type VehicleFilter = 'active' | 'all' | 'archived';

const createEmptyVehicleForm = (): VehicleFormValues => ({
  name: '',
  model_year: new Date().getFullYear(),
  weekly_price: 0,
  bond: 500,
  status: 'Available',
  image: DEFAULT_VEHICLE_IMAGE,
});
const bondStatusLabels = {
  to_collect: 'To be collected by admin',
  cash_paid: 'Paid cash',
  already_paid: 'Already paid / existing driver',
} as const;

const fluentInputClass =
  'w-full [&_input]:!text-white [&_input]:placeholder:!text-brand-grey/60 [&_textarea]:!text-white [&_textarea]:placeholder:!text-brand-grey/60 [&_select]:!text-white';
const getBondMethodForStatus = (
  status: keyof typeof bondStatusLabels
): 'cash' | 'existing_paid' | null => {
  if (status === 'cash_paid') return 'cash';
  if (status === 'already_paid') return 'existing_paid';
  return null;
};
const getBondMethodLabel = (method: 'cash' | 'existing_paid' | null | undefined) => {
  if (method === 'cash') return 'Cash';
  if (method === 'existing_paid') return 'Existing paid';
  return 'Not yet collected';
};
const adminTabLabels: Record<string, string> = {
  agreements: 'Agreements',
  applications: 'Applications',
  cars: 'Fleet',
  customers: 'Customers',
  dashboard: 'Overview',
  financials: 'Financials',
  invoices: 'Invoices',
  rentals: 'Rentals',
  'toll-notices': 'Toll Notices',
  maintenance: 'Maintenance',
};

const matchesSearch = (searchTerm: string, fields: Array<string | number | null | undefined>) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return fields.some((field) => String(field ?? '').toLowerCase().includes(normalizedSearch));
};

const copyTextToClipboard = async (value: string) => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

const promptForManualCopy = (value: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.prompt('Copy secure payment link', value);
};

const copyCheckoutLink = async (checkoutUrl: string) => {
  const copied = await copyTextToClipboard(checkoutUrl);

  if (!copied) {
    promptForManualCopy(checkoutUrl);
  }

  return copied;
};

const isRestrictedPaymentLinkError = (error: unknown) =>
  getApiErrorMessage(error, '')
    .toLowerCase()
    .includes('session-capable postgres connection');

export default function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dispatchToast } = useToastController('maple-admin-toaster');
  const notificationTimeoutRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddingCar, setIsAddingCar] = useState(false);
  const [editingCar, setEditingCar] = useState<CarType | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleFormValues>(createEmptyVehicleForm);
  const [vehicleInitialForm, setVehicleInitialForm] = useState<VehicleFormValues>(createEmptyVehicleForm);
  const [vehicleFormErrors, setVehicleFormErrors] = useState<
    Partial<Record<keyof VehicleFormValues, string>>
  >({});
  const [vehicleImageFile, setVehicleImageFile] = useState<File | null>(null);
  const [vehicleImagePreview, setVehicleImagePreview] = useState(DEFAULT_VEHICLE_IMAGE);
  const [isUploadingVehicleImage, setIsUploadingVehicleImage] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('all');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleDialogMode, setVehicleDialogMode] = useState<VehicleDialogMode | null>(null);
  const [vehicleActionTarget, setVehicleActionTarget] = useState<CarType | null>(null);

  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [openingDocument, setOpeningDocument] = useState<'license_photo' | 'license_back_photo' | 'passport_or_uber_profile_screenshot' | null>(null);
  const [isCancelApplicationModalOpen, setIsCancelApplicationModalOpen] = useState(false);
  const [cancelApplicationReason, setCancelApplicationReason] = useState('');
  const [applicationApprovalForm, setApplicationApprovalForm] = useState({
    approved_vehicle: '',
    approved_bond: '',
    bond_notes: '',
    bond_payment_status: 'to_collect' as keyof typeof bondStatusLabels,
    approved_weekly_price: '',
    rental_subscription_start_date: '',
  });

  // Agreement Management State
  const [isGeneratingAgreement, setIsGeneratingAgreement] = useState(false);
  const [selected_agreement_application_id, set_selected_agreement_application_id] = useState<string>('');
  const [agreementContent, setAgreementContent] = useState<string>('');
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
  const [agreementForm, setAgreementForm] = useState({
    renteeName: '',
    vehicleYear: '',
    weeklyRent: '',
    rentalStartDate: getTodayInAustralia(),
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [applicationSearch, setApplicationSearch] = useState('');
  const [rentalSearch, setRentalSearch] = useState('');
  const [tollNoticeInitialSearch, setTollNoticeInitialSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(OPERATIONAL_PAGE_SIZE);
  const [financialDateRange, setFinancialDateRange] = useState<DateRangeValue>(() =>
    getDateRangeForPreset('last7')
  );
  const [agreementModalMode, setAgreementModalMode] = useState<'draft' | 'saved'>('draft');
  const deferredCustomerSearch = useDeferredValue(customerSearch.trim());
  const deferredInvoiceSearch = useDeferredValue(invoiceSearch.trim());

  useEffect(() => {
    if (location.pathname === '/admin/agreements') {
      setActiveTab('agreements');
      return;
    }

    if (location.pathname === '/admin/toll-notices') {
      setActiveTab('toll-notices');
    }
  }, [location.pathname]);

  const openTollNotices = (searchValue = '') => {
    setTollNoticeInitialSearch(searchValue);
    setActiveTab('toll-notices');
    navigate('/admin/toll-notices');
  };

  const handleAdminTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(
      tab === 'toll-notices'
        ? '/admin/toll-notices'
        : tab === 'agreements'
          ? '/admin/agreements'
          : '/admin/dashboard'
    );
  };
  const deferredApplicationSearch = useDeferredValue(applicationSearch.trim());
  const deferredRentalSearch = useDeferredValue(rentalSearch.trim());
  const deferredVehicleSearch = useDeferredValue(vehicleSearch.trim());

  useEffect(() => {
    setCustomerPage(1);
  }, [deferredCustomerSearch]);

  useEffect(() => {
    setInvoicePage(1);
  }, [deferredInvoiceSearch, invoicePageSize]);

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (vehicleImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(vehicleImagePreview);
      }
    };
  }, [vehicleImagePreview]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    if (notificationTimeoutRef.current !== null) {
      window.clearTimeout(notificationTimeoutRef.current);
    }

    dispatchToast(
      <Toast>
        <ToastTitle>{message}</ToastTitle>
      </Toast>,
      {
        intent: type,
        timeout: 4500,
      }
    );

    setNotification({ message, type });
    notificationTimeoutRef.current = window.setTimeout(() => {
      setNotification(null);
      notificationTimeoutRef.current = null;
    }, 3000);
  };

  function resetVehicleModal() {
    setIsAddingCar(false);
    setEditingCar(null);
    setVehicleForm(createEmptyVehicleForm());
    setVehicleInitialForm(createEmptyVehicleForm());
    setVehicleFormErrors({});
    setVehicleImageFile(null);
    setVehicleImagePreview(DEFAULT_VEHICLE_IMAGE);
    setIsUploadingVehicleImage(false);
  }

  function openAddVehicleModal() {
    setEditingCar(null);
    setIsAddingCar(true);
    const emptyForm = createEmptyVehicleForm();
    setVehicleForm(emptyForm);
    setVehicleInitialForm(emptyForm);
    setVehicleFormErrors({});
    setVehicleImageFile(null);
    setVehicleImagePreview(DEFAULT_VEHICLE_IMAGE);
    setVehicleDialogMode(null);
    setVehicleActionTarget(null);
  }

  function openEditVehicleModal(car: CarType) {
    const nextForm = {
      bond: Number(car.bond || 0),
      image: car.image || DEFAULT_VEHICLE_IMAGE,
      model_year: Number(car.model_year || new Date().getFullYear()),
      name: car.name || '',
      status: car.status,
      weekly_price: Number(car.weekly_price || 0),
    };

    setEditingCar(car);
    setIsAddingCar(false);
    setVehicleForm(nextForm);
    setVehicleInitialForm(nextForm);
    setVehicleFormErrors({});
    setVehicleImageFile(null);
    setVehicleImagePreview(car.image || DEFAULT_VEHICLE_IMAGE);
    setVehicleDialogMode(null);
    setVehicleActionTarget(null);
  }

  const validateVehicleForm = () => {
    const nextErrors: Partial<Record<keyof VehicleFormValues, string>> = {};

    if (!vehicleForm.name.trim()) {
      nextErrors.name = 'Vehicle name is required.';
    }

    if (!Number.isFinite(vehicleForm.model_year) || vehicleForm.model_year < 1900) {
      nextErrors.model_year = 'Enter a valid model year.';
    }

    if (!Number.isFinite(vehicleForm.weekly_price) || vehicleForm.weekly_price <= 0) {
      nextErrors.weekly_price = 'Enter a weekly rental amount above $0.';
    }

    if (!Number.isFinite(vehicleForm.bond) || vehicleForm.bond < 0) {
      nextErrors.bond = 'Enter a valid bond amount.';
    }

    setVehicleFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleVehicleImagePrepared = ({
    file,
    previewUrl,
  }: {
    file: File;
    previewUrl: string;
  }) => {
    if (vehicleImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(vehicleImagePreview);
    }

    setVehicleImageFile(file);
    setVehicleImagePreview(previewUrl);
  };

  const handleRemoveVehicleImage = () => {
    if (vehicleImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(vehicleImagePreview);
    }

    setVehicleImageFile(null);
    setVehicleImagePreview(DEFAULT_VEHICLE_IMAGE);
    setVehicleForm((current) => ({ ...current, image: DEFAULT_VEHICLE_IMAGE }));
  };

  const closeVehicleActionDialog = () => {
    setVehicleDialogMode(null);
    setVehicleActionTarget(null);
  };

  const requestCloseVehicleModal = () => {
    if (hasUnsavedVehicleChanges) {
      setVehicleDialogMode('discard');
      setVehicleActionTarget(editingCar);
      return;
    }

    resetVehicleModal();
  };

  const handleSaveVehicle = async () => {
    if (!validateVehicleForm()) {
      showNotification('Please complete the required vehicle fields.', 'error');
      return;
    }

    let imageUrl = vehicleForm.image || DEFAULT_VEHICLE_IMAGE;
    let uploadedImage: { path: string; publicUrl: string } | null = null;

    try {
      if (vehicleImageFile) {
        setIsUploadingVehicleImage(true);
        uploadedImage = await uploadVehicleImage(vehicleImageFile);
        imageUrl = uploadedImage.publicUrl;
      }

      const payload: CarType = {
        id: editingCar?.id ?? 0,
        archived_at: editingCar?.archived_at ?? null,
        bond: Number(vehicleForm.bond),
        image: imageUrl,
        model_year: Number(vehicleForm.model_year),
        name: vehicleForm.name.trim(),
        status: vehicleForm.status,
        weekly_price: Number(vehicleForm.weekly_price),
      };

      if (editingCar) {
        await updateCarMutation.mutateAsync(payload);
      } else {
        await addCarMutation.mutateAsync(payload);
      }
    } catch (error) {
      if (uploadedImage?.publicUrl) {
        try {
          await api.removeVehicleImageUpload(uploadedImage.publicUrl);
        } catch (cleanupError) {
          console.warn('Failed to clean up uploaded vehicle image after save failure:', cleanupError);
        }
      }

      showNotification(
        getApiErrorMessage(
          error,
          vehicleImageFile
            ? uploadedImage
              ? editingCar
                ? 'Failed to update vehicle'
                : 'Failed to add vehicle'
              : 'Failed to upload vehicle image'
            : editingCar
              ? 'Failed to update vehicle'
              : 'Failed to add vehicle'
        ),
        'error'
      );
    } finally {
      setIsUploadingVehicleImage(false);
    }
  };

  const handleConfirmVehicleAction = () => {
    if (!vehicleDialogMode) {
      return;
    }

    if (vehicleDialogMode === 'discard') {
      closeVehicleActionDialog();
      resetVehicleModal();
      return;
    }

    if (!vehicleActionTarget) {
      return;
    }

    if (vehicleDialogMode === 'delete') {
      deleteCarMutation.mutate(vehicleActionTarget.id);
      return;
    }

    archiveCarMutation.mutate({
      id: vehicleActionTarget.id,
      archived: vehicleDialogMode === 'archive',
    });
  };

  const shouldLoadStats = activeTab === 'dashboard' || activeTab === 'financials';
  const shouldLoadCars = activeTab === 'dashboard' || activeTab === 'cars';
  const shouldLoadApplications =
    activeTab === 'dashboard' ||
    activeTab === 'applications' ||
    activeTab === 'agreements';
  const shouldLoadRentals = activeTab === 'rentals' || activeTab === 'toll-notices';
  const shouldLoadCustomers = activeTab === 'customers';
  const shouldLoadInvoices = activeTab === 'invoices';
  const shouldLoadWeeklyFinancials = activeTab === 'financials';
  const shouldLoadAgreements = activeTab === 'agreements';

  // Queries
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => api.fetchStats(),
    enabled: shouldLoadStats,
  });

  const carsQuery = useQuery<CarType[]>({
    queryKey: ['cars'],
    queryFn: () => api.fetchCars({ includeArchived: true }),
    enabled: shouldLoadCars,
  });

  const applicationsQuery = useQuery<Application[]>({
    queryKey: ['applications'],
    queryFn: () => api.fetchApplications(),
    enabled: shouldLoadApplications,
  });

  const rentalsQuery = useQuery<Rental[]>({
    queryKey: ['rentals'],
    queryFn: () => api.fetchRentals(),
    enabled: shouldLoadRentals,
  });

  const customerDatasetQuery = useQuery<AdminDatasetResponse<OperationalCustomer>>({
    queryKey: ['operational-customers', deferredCustomerSearch, customerPage, OPERATIONAL_PAGE_SIZE],
    queryFn: () =>
      api.fetchOperationalCustomers({
        page: customerPage,
        pageSize: OPERATIONAL_PAGE_SIZE,
        search: deferredCustomerSearch,
      }),
    enabled: shouldLoadCustomers,
    placeholderData: (previousData) => previousData,
  });

  const invoiceDatasetQuery = useQuery<AdminDatasetResponse<OperationalInvoice>>({
    queryKey: ['operational-invoices', deferredInvoiceSearch, invoicePage, invoicePageSize],
    queryFn: () =>
      api.fetchOperationalInvoices({
        page: invoicePage,
        pageSize: invoicePageSize,
        search: deferredInvoiceSearch,
      }),
    enabled: shouldLoadInvoices,
    placeholderData: (previousData) => previousData,
  });

  const weeklyFinancialsQuery = useQuery<api.WeeklyFinancials>({
    queryKey: ['weekly-financials', financialDateRange.startDate, financialDateRange.endDate],
    queryFn: () =>
      api.fetchWeeklyFinancials({
        endDate: financialDateRange.endDate,
        startDate: financialDateRange.startDate,
      }),
    enabled: shouldLoadWeeklyFinancials,
  });

  const savedAgreementsQuery = useQuery({
    queryKey: ['agreements'],
    queryFn: () => api.fetchSavedLeaseAgreements(),
    enabled: shouldLoadAgreements,
  });

  // Mutations
  const addCarMutation = useMutation({
    mutationFn: (car: Partial<CarType>) => api.createCar(car),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      resetVehicleModal();
      showNotification('Vehicle added successfully', 'success');
    },
    onError: (error) =>
      showNotification(getApiErrorMessage(error, 'Failed to add vehicle'), 'error'),
  });
  const updateCarMutation = useMutation({
    mutationFn: (car: CarType) => api.updateCar(car.id, car),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      resetVehicleModal();
      showNotification('Vehicle updated successfully', 'success');
    },
    onError: (error) =>
      showNotification(getApiErrorMessage(error, 'Failed to update vehicle'), 'error'),
  });

  const deleteCarMutation = useMutation({
    mutationFn: (id: number) => api.deleteCar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      closeVehicleActionDialog();
      resetVehicleModal();
      showNotification('Vehicle deleted successfully', 'success');
    },
    onError: (error) =>
      showNotification(getApiErrorMessage(error, 'Failed to delete vehicle'), 'error'),
  });

  const archiveCarMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => api.archiveCar(id, archived),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      closeVehicleActionDialog();
      resetVehicleModal();
      showNotification(
        variables.archived ? 'Vehicle archived successfully' : 'Vehicle restored successfully',
        'success'
      );
    },
    onError: (error, variables) =>
      showNotification(
        getApiErrorMessage(
          error,
          variables.archived ? 'Failed to archive vehicle' : 'Failed to restore vehicle'
        ),
        'error'
      ),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => api.updateApplicationStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      showNotification('Application status updated', 'success');
    },
    onError: () => showNotification('Failed to update status', 'error'),
  });

  const cancelApplicationMutation = useMutation({
    mutationFn: ({ id, cancel_reason }: { id: string; cancel_reason?: string }) =>
      api.cancelApplication(id, { cancel_reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      setSelectedApplication(null);
      setIsCancelApplicationModalOpen(false);
      setCancelApplicationReason('');
      showNotification('Application cancelled successfully', 'success');
    },
    onError: () => showNotification('Failed to cancel application', 'error'),
  });

  const saveAgreementMutation = useMutation({
    mutationFn: (payload: { application_id: string; content: string; vehicle_label?: string | null }) =>
      api.saveLeaseAgreement(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      setIsAgreementModalOpen(false);
      setAgreementModalMode('draft');
      showNotification('Agreement saved successfully', 'success');
    },
    onError: () => showNotification('Failed to save agreement', 'error'),
  });

  const approveApplicationPaymentMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        approved_vehicle: string;
        approved_bond: number;
        bond_notes?: string | null;
        bond_payment_method?: 'cash' | 'existing_paid' | null;
        bond_payment_status?: 'to_collect' | 'cash_paid' | 'already_paid';
        approved_weekly_price: number;
        rental_subscription_start_date?: string;
        send_payment_link?: boolean;
      };
    }) => api.approveApplicationForPayment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['cars'] });
    },
  });

  const generateCheckoutLinkMutation = useMutation({
    mutationFn: (payload: { application_id: string }) =>
      api.createVehicleCheckoutLink(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['cars'] });
    },
  });

  const retryPaymentReviewActivationMutation = useMutation({
    mutationFn: (id: string) => api.retryApplicationPaymentActivation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['cars'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
    },
  });

  const cancelRentalSubscriptionMutation = useMutation({
    mutationFn: ({
      cancelAtPeriodEnd,
      confirm,
      reason,
      rentalId,
    }: {
      cancelAtPeriodEnd: boolean;
      confirm: 'CANCEL SUBSCRIPTION';
      reason?: string;
      rentalId: number;
    }) =>
      api.cancelRentalStripeSubscription(rentalId, {
        cancelAtPeriodEnd,
        confirm,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      showNotification('Stripe subscription cancellation updated.', 'success');
    },
    onError: (error) =>
      showNotification(
        getApiErrorMessage(error, 'Failed to cancel Stripe subscription'),
        'error'
      ),
  });

  const deleteAgreementMutation = useMutation({
    mutationFn: (id: number) => api.deleteSavedLeaseAgreement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showNotification('Agreement deleted successfully', 'success');
    },
    onError: () => showNotification('Failed to delete agreement', 'error'),
  });

  const handleLogout = async () => {
    try {
      await api.logoutAdmin();
    } catch (e) {
      console.error('Logout error:', e);
    }

    queryClient.clear();
    navigate('/admin/login', { replace: true });
  };

  const handleGenerateAgreement = async () => {
    const application_id = selected_agreement_application_id;
    const selectedApplication = applications.find((a) => a.id === application_id);

    if (!application_id || !selectedApplication) {
      showNotification('Please select an application', 'error');
      return;
    }

    if (selectedApplication.status !== 'Paid') {
      showNotification('Driver payment must be completed before generating the agreement.', 'error');
      return;
    }

    setIsGeneratingAgreement(true);
    try {
      const vehicleLabel =
        selectedApplication.approved_vehicle?.trim() || 'Approved vehicle';

      const payload = {
        agreementDate: new Date().toLocaleDateString('en-AU'),
        renteeName: selectedApplication?.name,
        renteeEmail: selectedApplication?.email,
        renteeContact: selectedApplication?.phone,
        renteeAddress: selectedApplication?.address,
        renteeLicenseNumber: selectedApplication?.license_number,
        vehicleMake: 'Not recorded',
        vehicleModel: vehicleLabel,
        vehicleYear: agreementForm.vehicleYear || 'Not recorded',
        weeklyRent: `$${Number(selectedApplication.approved_weekly_price ?? 0).toFixed(2)}`,
        bondAmount: `$${Number(selectedApplication.approved_bond ?? 0).toFixed(2)}`,
        bondNotes: selectedApplication.bond_notes || '',
        bondPaymentMethod: getBondMethodLabel(selectedApplication.bond_payment_method),
        bondPaymentStatus:
          bondStatusLabels[selectedApplication.bond_payment_status || 'to_collect'],
        rentalStartDate: agreementForm.rentalStartDate,
      };

      const res = await api.renderCarLeaseAgreement(payload);
      setAgreementContent(res.agreement);
      setAgreementModalMode('draft');
      setIsAgreementModalOpen(true);
    } catch (err) {
      showNotification('Failed to generate agreement', 'error');
    } finally {
      setIsGeneratingAgreement(false);
    }
  };

  const handleCopyVehicleCheckoutLink = async () => {
    const application_id = selected_agreement_application_id;

    if (!application_id) {
      showNotification('Please select an approved application', 'error');
      return;
    }

    try {
      const response = await generateCheckoutLinkMutation.mutateAsync({
        application_id,
      });
      const copied = await copyTextToClipboard(response.checkout_url);

      if (!copied) {
        promptForManualCopy(response.checkout_url);
      }

      showNotification(
        copied
          ? 'Secure payment link copied!'
          : 'Secure payment link generated. Use the prompt to copy it manually.',
        'success'
      );
    } catch (error) {
      showNotification(
        getApiErrorMessage(error, 'Failed to generate secure payment link'),
        'error'
      );
    }
  };

  const handleApproveSelectedApplication = async () => {
    if (!selectedApplication) {
      return;
    }

    const applicationId = selectedApplication.id;
    const approvedVehicle = applicationApprovalForm.approved_vehicle.trim();
    const approvedBond = Number(applicationApprovalForm.approved_bond);
    const approvedWeeklyPrice = Number(applicationApprovalForm.approved_weekly_price);
    const bondPaymentStatus = applicationApprovalForm.bond_payment_status;
    const bondPaymentMethod = getBondMethodForStatus(bondPaymentStatus);
    const bondNotes = applicationApprovalForm.bond_notes.trim();
    const rentalSubscriptionStartDate =
      applicationApprovalForm.rental_subscription_start_date.trim();

    if (!approvedVehicle || approvedBond < 0 || approvedWeeklyPrice <= 0) {
      showNotification('Enter the approved vehicle, bond, and weekly payment amounts.', 'error');
      return;
    }

    try {
      const response = await approveApplicationPaymentMutation.mutateAsync({
        id: applicationId,
        payload: {
          approved_vehicle: approvedVehicle,
          approved_bond: approvedBond,
          bond_notes: bondNotes || null,
          bond_payment_method: bondPaymentMethod,
          bond_payment_status: bondPaymentStatus,
          approved_weekly_price: approvedWeeklyPrice,
          ...(rentalSubscriptionStartDate
            ? { rental_subscription_start_date: rentalSubscriptionStartDate }
            : {}),
          send_payment_link: true,
        },
      });

      if (!response.email_delivered) {
        const copied = await copyCheckoutLink(response.checkout_url);
        showNotification(
          response.email_reason
            ? copied
              ? 'Pricing saved. Email not sent; payment link copied instead.'
              : 'Pricing saved. Email not sent; use the prompt to copy the payment link.'
            : copied
              ? 'Pricing saved and payment link copied.'
              : 'Pricing saved. Use the prompt to copy the payment link.',
          'success'
        );
      } else {
        showNotification('Application approved and payment link emailed.', 'success');
      }

      setSelectedApplication(null);
    } catch (error) {
      if (isRestrictedPaymentLinkError(error)) {
        try {
          const restrictedApproval = await approveApplicationPaymentMutation.mutateAsync({
            id: applicationId,
            payload: {
              approved_vehicle: approvedVehicle,
              approved_bond: approvedBond,
              bond_notes: bondNotes || null,
              bond_payment_method: bondPaymentMethod,
              bond_payment_status: bondPaymentStatus,
              approved_weekly_price: approvedWeeklyPrice,
              ...(rentalSubscriptionStartDate
                ? { rental_subscription_start_date: rentalSubscriptionStartDate }
                : {}),
              send_payment_link: false,
            },
          });

          let checkoutUrl = restrictedApproval.checkout_url;

          try {
            const generatedLink = await generateCheckoutLinkMutation.mutateAsync({
              application_id: applicationId,
            });
            checkoutUrl = generatedLink.checkout_url;
          } catch (generateLinkError) {
            console.warn(
              'Failed to generate a dedicated checkout link after restricted-mode approval:',
              generateLinkError
            );
          }

          const copied = await copyCheckoutLink(checkoutUrl);
          showNotification(
            copied
              ? 'Pricing saved. Email is unavailable in restricted mode, so the payment link was copied instead.'
              : 'Pricing saved. Email is unavailable in restricted mode; use the prompt to copy the payment link.',
            'success'
          );
          setSelectedApplication(null);
          return;
        } catch (fallbackError) {
          showNotification(
            getApiErrorMessage(
              fallbackError,
              'Failed to approve application and generate a manual payment link'
            ),
            'error'
          );
          return;
        }
      }

      showNotification(
        getApiErrorMessage(error, 'Failed to approve application for payment'),
        'error'
      );
    }
  };

  const handleRetrySelectedApplicationActivation = async () => {
    if (!selectedApplication) {
      return;
    }

    try {
      await retryPaymentReviewActivationMutation.mutateAsync(selectedApplication.id);
      showNotification('Payment finalization completed and the application is marked paid.', 'success');
      setSelectedApplication(null);
    } catch (error) {
      showNotification(
        getApiErrorMessage(error, 'Failed to retry payment activation'),
        'error'
      );
    }
  };

  const handleOpenApplicationDocument = async (
    document: 'license_photo' | 'license_back_photo' | 'passport_or_uber_profile_screenshot'
  ) => {
    if (!selectedApplication) {
      return;
    }

    setOpeningDocument(document);

    try {
      const response = await api.fetchApplicationDocumentUrl(selectedApplication.id, document);
      window.open(response.url, '_blank', 'noopener,noreferrer');
    } catch {
      showNotification('Failed to open the latest signed document link', 'error');
    } finally {
      setOpeningDocument(null);
    }
  };

  const stats = statsQuery.data;
  const cars = carsQuery.data || [];
  const activeCars = cars.filter((car) => !car.archived_at);
  const filteredCars = cars.filter((car) => {
    const matchesFilter =
      vehicleFilter === 'all'
        ? true
        : vehicleFilter === 'active'
          ? !car.archived_at
          : Boolean(car.archived_at);

    return (
      matchesFilter &&
      matchesSearch(deferredVehicleSearch, [car.name, car.model_year, car.status, car.weekly_price])
    );
  });
  const applications = applicationsQuery.data || [];
  const rentals = rentalsQuery.data || [];
  const customerDataset = customerDatasetQuery.data;
  const invoiceDataset = invoiceDatasetQuery.data;
  const weeklyFinancials = weeklyFinancialsQuery.data;
  const savedAgreements = savedAgreementsQuery.data || [];

  useEffect(() => {
    if (!selectedApplication) {
      return;
    }

    setApplicationApprovalForm({
      approved_vehicle: selectedApplication.approved_vehicle || '',
      approved_bond:
        selectedApplication.approved_bond != null ? String(selectedApplication.approved_bond) : '',
      bond_notes: selectedApplication.bond_notes || '',
      bond_payment_status: selectedApplication.bond_payment_status || 'to_collect',
      approved_weekly_price:
        selectedApplication.approved_weekly_price != null
          ? String(selectedApplication.approved_weekly_price)
          : '',
      rental_subscription_start_date: selectedApplication.intended_start_date || '',
    });
  }, [selectedApplication]);

  const isLoadingCustomerDataset = shouldLoadCustomers && customerDatasetQuery.isPending && !customerDataset;
  const isLoadingInvoiceDataset = shouldLoadInvoices && invoiceDatasetQuery.isPending && !invoiceDataset;
  const isLoadingWeeklyFinancials =
    shouldLoadWeeklyFinancials && weeklyFinancialsQuery.isPending && !weeklyFinancials;
  const approvedApplications = applications.filter(
    (app) => app.status === 'Approved' || app.status === 'Paid'
  );
  const filteredApplications = applications.filter((app) =>
    matchesSearch(deferredApplicationSearch, [
      app.address,
      app.email,
      app.experience,
      app.name,
      app.phone,
      app.status,
      app.uber_status,
    ])
  );
  const filteredRentals = rentals.filter((rental) =>
    matchesSearch(deferredRentalSearch, [
      rental.applicant_name,
      rental.car_name,
      rental.start_date,
      rental.status,
      rental.weekly_price,
    ])
  );
  const selectedAgreementApplication = applications.find(
    (app) => app.id === selected_agreement_application_id
  );
  const canCopyVehicleCheckoutLink =
    Boolean(selectedAgreementApplication) &&
    selectedAgreementApplication?.status === 'Approved';
  const formatCurrency = (value?: number | string | null) => `$${Number(value ?? 0).toFixed(2)}`;
  const formatDate = (value?: string | null) => {
    if (!value) {
      return 'N/A';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString();
  };
  const customerRecords = customerDataset?.items || [];
  const invoiceRecords = invoiceDataset?.items || [];
  const customerHistoryAvailable = customerDataset ? customerDataset.available !== false : true;
  const invoiceHistoryAvailable = invoiceDataset ? invoiceDataset.available !== false : true;
  const operationalHistoryMessage =
    customerDataset?.message ||
    invoiceDataset?.message ||
    'Operational history is not installed in this environment yet.';
  const customerTotals = {
    total_billed: customerRecords.reduce((sum, customer) => sum + (Number(customer.total_billed) || 0), 0),
    outstanding_balance: customerRecords.reduce(
      (sum, customer) => sum + (Number(customer.outstanding_balance) || 0),
      0
    ),
  };
  const invoiceTotals = {
    total_amount: invoiceRecords.reduce((sum, invoice) => sum + (Number(invoice.amount) || 0), 0),
    outstanding_balance: invoiceRecords.reduce((sum, invoice) => sum + (Number(invoice.balance) || 0), 0),
    open_count: invoiceRecords.filter((invoice) => invoice.status === 'Open').length,
  };
  const currentCustomerPage = customerDataset?.page || 1;
  const customerTotalPages = customerDataset?.totalPages || 1;
  const customerTotalItems = customerDataset?.totalItems || 0;
  const invoiceCurrentPage = invoiceDataset?.page || 1;
  const invoiceTotalPages = invoiceDataset?.totalPages || 1;
  const invoiceTotalItems = invoiceDataset?.totalItems || 0;
  const isVehicleModalOpen = isAddingCar || Boolean(editingCar);
  const isVehicleSubmitting =
    isUploadingVehicleImage || addCarMutation.isPending || updateCarMutation.isPending;
  const isVehicleActionPending =
    archiveCarMutation.isPending || deleteCarMutation.isPending;
  const hasUnsavedVehicleChanges =
    vehicleImageFile !== null || JSON.stringify(vehicleForm) !== JSON.stringify(vehicleInitialForm);
  const renderLoadingPanel = (message: string) => (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-10 flex items-center gap-4 text-sm text-brand-grey">
      <Loader2 className="w-5 h-5 animate-spin text-brand-gold" />
      <span>{message}</span>
    </div>
  );
  const renderOperationalUnavailable = (title: string) => (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-10 space-y-4">
      <div className="w-12 h-12 bg-brand-gold/10 rounded-2xl flex items-center justify-center border border-brand-gold/20">
        <AlertCircle className="w-5 h-5 text-brand-gold" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-brand-grey leading-relaxed">{operationalHistoryMessage}</p>
      </div>
      <div className="break-words bg-brand-navy/60 border border-white/10 rounded-2xl px-5 py-4 text-[11px] text-brand-grey font-light">
        Run <span className="font-mono text-white">npm run migrate:operational-history</span> with
        {' '}<span className="font-mono text-white">DATABASE_URL</span> or{' '}
        <span className="font-mono text-white">SUPABASE_DB_URL</span>. Legacy workbook imports now require{' '}
        <span className="font-mono text-white">ALLOW_LEGACY_IMPORT=true</span> and should not be used for production data.
      </div>
    </div>
  );
  const closeAgreementModal = () => {
    setIsAgreementModalOpen(false);
    setAgreementModalMode('draft');
  };

  return (
    <div className="min-h-screen bg-brand-navy">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleAdminTabChange}
        handleLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="min-h-screen overflow-x-hidden px-4 pb-8 pt-0 sm:px-6 lg:ml-72 lg:min-h-screen lg:overflow-y-auto lg:p-12">
        <div className="sticky top-0 z-30 -mx-4 mb-6 flex items-center justify-between border-b border-white/10 bg-brand-navy/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:hidden">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold">Admin Panel</p>
            <h1 className="mt-1 text-lg font-bold uppercase tracking-tight text-white">
              {adminTabLabels[activeTab] || 'Overview'}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white transition-all hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <OverviewTab
              stats={stats}
              applications={applications}
              cars={activeCars}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'applications' && (
            <ApplicationsTab
              applicationSearch={applicationSearch}
              setApplicationSearch={setApplicationSearch}
              filteredApplications={filteredApplications}
              setSelectedApplication={setSelectedApplication}
            />
          )}

          {activeTab === 'cars' && (
            <FleetTab
              cars={cars}
              filter={vehicleFilter}
              isLoading={carsQuery.isPending && !carsQuery.data}
              onAddVehicle={openAddVehicleModal}
              onArchiveVehicle={(car) => {
                setVehicleDialogMode('archive');
                setVehicleActionTarget(car);
              }}
              onDeleteVehicle={(car) => {
                setVehicleDialogMode('delete');
                setVehicleActionTarget(car);
              }}
              onEditVehicle={openEditVehicleModal}
              onFilterChange={setVehicleFilter}
              onRestoreVehicle={(car) => {
                setVehicleDialogMode('restore');
                setVehicleActionTarget(car);
              }}
              onSearchChange={setVehicleSearch}
              searchTerm={vehicleSearch}
              visibleCars={filteredCars}
            />
          )}

          {activeTab === 'rentals' && (
            <RentalsTab
              rentalSearch={rentalSearch}
              setRentalSearch={setRentalSearch}
              filteredRentals={filteredRentals}
              onCancelSubscription={(payload) =>
                cancelRentalSubscriptionMutation.mutateAsync(payload)
              }
              onCreateTollNotice={(rental) =>
                openTollNotices(
                  String(rental.application_id || rental.applicant_name || rental.car_name || '')
                )
              }
            />
          )}

          {activeTab === 'financials' && (
            <FinancialsTab
              dateRange={financialDateRange}
              isLoadingWeeklyFinancials={isLoadingWeeklyFinancials}
              weeklyFinancials={weeklyFinancials}
              onDateRangeChange={setFinancialDateRange}
              onRefresh={() => weeklyFinancialsQuery.refetch()}
              formatCurrency={formatCurrency}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersTab
              customerSearch={customerSearch}
              setCustomerSearch={setCustomerSearch}
              isLoadingCustomerDataset={isLoadingCustomerDataset}
              customerHistoryAvailable={customerHistoryAvailable}
              deferredCustomerSearch={deferredCustomerSearch}
              customerTotalItems={customerTotalItems}
              customerTotals={customerTotals}
              customerRecords={customerRecords}
              currentCustomerPage={currentCustomerPage}
              customerTotalPages={customerTotalPages}
              isFetching={customerDatasetQuery.isFetching}
              setCustomerPage={setCustomerPage}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              operationalHistoryMessage={operationalHistoryMessage}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesTab
              invoiceSearch={invoiceSearch}
              setInvoiceSearch={setInvoiceSearch}
              isLoadingInvoiceDataset={isLoadingInvoiceDataset}
              invoiceHistoryAvailable={invoiceHistoryAvailable}
              deferredInvoiceSearch={deferredInvoiceSearch}
              invoiceTotalItems={invoiceTotalItems}
              invoiceTotals={invoiceTotals}
              invoiceRecords={invoiceRecords}
              invoiceCurrentPage={invoiceCurrentPage}
              invoiceTotalPages={invoiceTotalPages}
              invoicePageSize={invoicePageSize}
              isFetching={invoiceDatasetQuery.isFetching}
              setInvoicePage={setInvoicePage}
              setInvoicePageSize={setInvoicePageSize}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              operationalHistoryMessage={operationalHistoryMessage}
            />
          )}

          {activeTab === 'agreements' && (
            <AgreementsTab
              approvedApplications={approvedApplications}
              selected_agreement_application_id={selected_agreement_application_id}
              set_selected_agreement_application_id={set_selected_agreement_application_id}
              selectedAgreementApplication={selectedAgreementApplication}
              isGeneratingAgreement={isGeneratingAgreement}
              handleGenerateAgreement={handleGenerateAgreement}
              canCopyVehicleCheckoutLink={canCopyVehicleCheckoutLink}
              generateCheckoutLinkMutation={generateCheckoutLinkMutation}
              handleCopyVehicleCheckoutLink={handleCopyVehicleCheckoutLink}
              savedAgreements={savedAgreements}
              setAgreementModalMode={setAgreementModalMode}
              setAgreementContent={setAgreementContent}
              setIsAgreementModalOpen={setIsAgreementModalOpen}
              deleteAgreementMutation={deleteAgreementMutation}
            />
          )}

          {activeTab === 'toll-notices' && (
            <TollStatDecTab initialSearch={tollNoticeInitialSearch} />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceTab />
          )}
        </AnimatePresence>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className={`fixed inset-x-4 bottom-4 z-[60] flex items-center gap-4 rounded-2xl border px-5 py-4 shadow-2xl sm:px-8 sm:py-5 lg:inset-x-auto lg:left-1/2 lg:min-w-[300px] lg:-translate-x-1/2 ${
              notification.type === 'success' ? 'bg-green-500 border-green-400 text-white' : 'bg-red-500 border-red-400 text-white'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="text-xs font-bold uppercase tracking-widest">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Application Review Modal */}
      <AnimatePresence>
        {selectedApplication && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/60 backdrop-blur-xl sm:items-center sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4 sm:p-8">
                <div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Review Application</h3>
                  <p className="text-[10px] text-brand-grey uppercase tracking-widest mt-1">Driver profile and submitted documents</p>
                </div>
                <button
                  onClick={() => setSelectedApplication(null)}
                  className="text-brand-grey hover:text-white p-2 bg-white/5 rounded-full"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="max-h-[75vh] space-y-8 overflow-y-auto p-4 sm:p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Card appearance="filled" className="!rounded-lg !border !border-white/10 !bg-white/5 !p-6">
                    <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Applicant Details</h4>
                    <div className="space-y-4 text-sm">
                      <div className="flex items-center gap-3 text-white"><BadgeCheck className="w-4 h-4 text-brand-gold" /> {selectedApplication.name}</div>
                      <div className="flex items-center gap-3 text-brand-grey"><Mail className="w-4 h-4 text-brand-gold" /> {selectedApplication.email}</div>
                      <div className="flex items-center gap-3 text-brand-grey"><Phone className="w-4 h-4 text-brand-gold" /> {selectedApplication.phone}</div>
                      <div className="flex items-start gap-3 text-brand-grey"><MapPin className="w-4 h-4 text-brand-gold mt-0.5" /> <span>{selectedApplication.address}</span></div>
                    </div>
                  </Card>

                  <Card appearance="filled" className="!rounded-lg !border !border-white/10 !bg-white/5 !p-6">
                    <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Application Snapshot</h4>
                    <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                      <div>
                        <p className="text-brand-grey uppercase tracking-widest mb-2">Status</p>
                        <Badge
                          appearance="filled"
                          color={
                            selectedApplication.status === 'Paid'
                              ? 'success'
                              : selectedApplication.status === 'Payment Review'
                                ? 'warning'
                                : selectedApplication.status === 'Rejected' ||
                                    selectedApplication.status === 'Cancelled'
                                  ? 'danger'
                                  : 'brand'
                          }
                          shape="rounded"
                        >
                          {selectedApplication.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-brand-grey uppercase tracking-widest mb-2">Uber Status</p>
                        <p className="text-white font-bold">{selectedApplication.uber_status}</p>
                      </div>
                      <div>
                        <p className="text-brand-grey uppercase tracking-widest mb-2">Experience</p>
                        <p className="text-white font-bold">{selectedApplication.experience}</p>
                      </div>
                      <div>
                        <p className="text-brand-grey uppercase tracking-widest mb-2">Start Date</p>
                        <p className="text-white font-bold">{selectedApplication.intended_start_date}</p>
                      </div>
                      <div>
                        <p className="text-brand-grey uppercase tracking-widest mb-2">License #</p>
                        <p className="text-white font-bold">{selectedApplication.license_number}</p>
                      </div>
                      <div>
                        <p className="text-brand-grey uppercase tracking-widest mb-2">Expiry</p>
                        <p className="text-white font-bold">{selectedApplication.license_expiry}</p>
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                    <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Licence Front Photo</h4>
                    {selectedApplication.license_photo ? (
                    <Button
                      type="button"
                      appearance="primary"
                      onClick={() => handleOpenApplicationDocument('license_photo')}
                      disabled={openingDocument !== null}
                      className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest"
                      icon={
                        openingDocument === 'license_photo' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ExternalLink className="w-4 h-4" />
                        )
                      }
                    >
                      Open Licence Front Photo
                    </Button>
                    ) : (
                      <div className="px-6 py-4 border border-white/10 rounded-2xl text-brand-grey text-xs font-light">
                        No licence front photo uploaded.
                      </div>
                    )}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                    <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">Licence Back Photo</h4>
                    {selectedApplication.license_back_photo ? (
                    <Button
                      type="button"
                      appearance="secondary"
                      onClick={() => handleOpenApplicationDocument('license_back_photo')}
                      disabled={openingDocument !== null}
                      className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest"
                      icon={
                        openingDocument === 'license_back_photo' ? (
                          <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
                        ) : (
                          <ExternalLink className="w-4 h-4 text-brand-gold" />
                        )
                      }
                    >
                      Open Licence Back Photo
                    </Button>
                    ) : (
                      <div className="px-6 py-4 border border-white/10 rounded-2xl text-brand-grey text-xs font-light">
                        No licence back photo uploaded.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                    <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                      Passport or Uber Profile Screenshot
                    </h4>
                    {selectedApplication.passport_or_uber_profile_screenshot ? (
                      <Button
                        type="button"
                        appearance="primary"
                        onClick={() =>
                          handleOpenApplicationDocument(
                            'passport_or_uber_profile_screenshot',
                          )
                        }
                        disabled={openingDocument !== null}
                        className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest"
                        icon={
                          openingDocument === 'passport_or_uber_profile_screenshot' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ExternalLink className="w-4 h-4" />
                          )
                        }
                      >
                        Open Passport or Uber Screenshot
                      </Button>
                    ) : (
                      <div className="px-6 py-4 border border-white/10 rounded-2xl text-brand-grey text-xs font-light">
                        No passport or Uber screenshot uploaded.
                      </div>
                    )}
                  </div>

                  <div className="bg-brand-navy/60 border border-brand-gold/15 rounded-3xl p-6 space-y-3">
                    <h4 className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
                      Rental Agreement Acceptance
                    </h4>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-brand-grey">
                          Accepted at
                        </p>
                        <p className="mt-2 text-sm text-white">
                          {formatDate(selectedApplication.agreement_accepted_at)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-brand-grey">
                          Signature
                        </p>
                        <p className="mt-2 break-words text-sm text-white">
                          {selectedApplication.agreement_signature || 'Not recorded'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-brand-grey">
                          Template version
                        </p>
                        <p className="mt-2 text-sm text-white">
                          {selectedApplication.agreement_template_version ?? 'Not recorded'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedApplication.status === 'Cancelled' && (
                  <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-300">
                      Application cancelled
                    </p>
                    <p className="text-sm text-brand-grey leading-relaxed">
                      Cancelled at{' '}
                      <span className="text-white">
                        {formatDate(selectedApplication.cancelled_at)}
                      </span>
                    </p>
                    <p className="text-sm text-brand-grey leading-relaxed">
                      Reason:{' '}
                      <span className="text-white">
                        {selectedApplication.cancel_reason || 'No reason recorded'}
                      </span>
                    </p>
                  </div>
                )}

                {selectedApplication.status === 'Payment Review' && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                      Payment received, activation pending
                    </p>
                    <p className="text-sm text-brand-grey font-light leading-relaxed">
                      Stripe reported a completed payment, but activation is waiting on a vehicle
                      conflict or maintenance hold. Resolve the blocker and the next matching Stripe
                      completion can finish automatically, or use Retry Activation now.
                    </p>
                    {selectedApplication.paid_at && (
                      <p className="text-xs text-amber-200/80 font-light">
                        Payment recorded {new Date(selectedApplication.paid_at).toLocaleString()}.
                      </p>
                    )}
                    {selectedApplication.pending_checkout_session_id && (
                      <p className="text-[10px] text-amber-200/80 font-mono break-all">
                        Session: {selectedApplication.pending_checkout_session_id}
                      </p>
                    )}
                  </div>
                )}

                {selectedApplication.status !== 'Paid' &&
                  selectedApplication.status !== 'Rejected' &&
                  selectedApplication.status !== 'Payment Review' && (
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                      <div>
                        <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                          Approval & Payment Quote
                        </h4>
                        <p className="text-sm text-brand-grey font-light mt-3 max-w-2xl">
                          Confirm the approved vehicle, record the manual bond, and email a fresh secure Stripe payment link for weekly rent only.
                        </p>
                      </div>
                      {selectedApplication.payment_link_sent_at && (
                        <div className="rounded-2xl border border-white/10 bg-brand-navy/40 px-4 py-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                            Last payment link sent
                          </p>
                          <p className="text-xs text-white">
                            {new Date(selectedApplication.payment_link_sent_at).toLocaleString()}
                          </p>
                          {selectedApplication.pending_checkout_session_id && (
                            <p className="text-[10px] text-brand-grey font-mono break-all">
                              Session: {selectedApplication.pending_checkout_session_id}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                      <Field
                        label="Vehicle / Number Plate"
                        className="[&_label]:!text-[10px] [&_label]:!font-bold [&_label]:!uppercase [&_label]:!tracking-widest [&_label]:!text-brand-grey"
                      >
                        <Input
                          type="text"
                          appearance="filled-darker"
                          value={applicationApprovalForm.approved_vehicle}
                          onChange={(e) =>
                            setApplicationApprovalForm((current) => ({
                              ...current,
                              approved_vehicle: e.target.value,
                            }))
                          }
                          className={fluentInputClass}
                          placeholder="Toyota Camry Hybrid - ABC123"
                        />
                      </Field>
                      <Field
                        label="Approved Bond (AUD)"
                        hint="Manual admin record only. Not sent to Stripe as a charge."
                        className="[&_label]:!text-[10px] [&_label]:!font-bold [&_label]:!uppercase [&_label]:!tracking-widest [&_label]:!text-brand-grey [&_.fui-Field__hint]:!text-brand-grey"
                      >
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          contentBefore="$"
                          appearance="filled-darker"
                          value={applicationApprovalForm.approved_bond}
                          onChange={(e) =>
                            setApplicationApprovalForm((current) => ({
                              ...current,
                              approved_bond: e.target.value,
                            }))
                          }
                          className={fluentInputClass}
                        />
                      </Field>
                      <Field
                        label="Bond status"
                        className="[&_label]:!text-[10px] [&_label]:!font-bold [&_label]:!uppercase [&_label]:!tracking-widest [&_label]:!text-brand-grey"
                      >
                        <Select
                          appearance="filled-darker"
                          value={applicationApprovalForm.bond_payment_status}
                          onChange={(e) =>
                            setApplicationApprovalForm((current) => ({
                              ...current,
                              bond_payment_status: e.target
                                .value as keyof typeof bondStatusLabels,
                            }))
                          }
                          className={fluentInputClass}
                        >
                          <option value="to_collect">To collect by admin</option>
                          <option value="cash_paid">Paid cash</option>
                          <option value="already_paid">
                            Already paid / existing driver
                          </option>
                        </Select>
                      </Field>
                      <Field
                        label="Approved Weekly Payment (AUD)"
                        hint="This is the only recurring amount charged by Stripe."
                        className="[&_label]:!text-[10px] [&_label]:!font-bold [&_label]:!uppercase [&_label]:!tracking-widest [&_label]:!text-brand-grey [&_.fui-Field__hint]:!text-brand-grey"
                      >
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          contentBefore="$"
                          appearance="filled-darker"
                          value={applicationApprovalForm.approved_weekly_price}
                          onChange={(e) =>
                            setApplicationApprovalForm((current) => ({
                              ...current,
                              approved_weekly_price: e.target.value,
                            }))
                          }
                          className={fluentInputClass}
                        />
                      </Field>
                      <Field
                        label="Rental subscription start date"
                        className="[&_label]:!text-[10px] [&_label]:!font-bold [&_label]:!uppercase [&_label]:!tracking-widest [&_label]:!text-brand-grey"
                      >
                        <Input
                          type="date"
                          appearance="filled-darker"
                          value={applicationApprovalForm.rental_subscription_start_date}
                          onChange={(e) =>
                            setApplicationApprovalForm((current) => ({
                              ...current,
                              rental_subscription_start_date: e.target.value,
                            }))
                          }
                          className={fluentInputClass}
                        />
                      </Field>
                      <Field
                        label="Bond notes"
                        hint="Use this for cash receipt notes or existing-driver proof."
                        className="md:col-span-2 xl:col-span-4 [&_label]:!text-[10px] [&_label]:!font-bold [&_label]:!uppercase [&_label]:!tracking-widest [&_label]:!text-brand-grey [&_.fui-Field__hint]:!text-brand-grey"
                      >
                        <Textarea
                          appearance="filled-darker"
                          value={applicationApprovalForm.bond_notes}
                          onChange={(e) =>
                            setApplicationApprovalForm((current) => ({
                              ...current,
                              bond_notes: e.target.value,
                            }))
                          }
                          className={`${fluentInputClass} [&_textarea]:!min-h-24`}
                          placeholder="Optional admin note for cash collection or existing bond proof"
                        />
                      </Field>
                    </div>

                    {applicationApprovalForm.approved_vehicle && (
                      <div className="rounded-2xl border border-brand-gold/20 bg-brand-gold/5 px-5 py-4 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">
                          Approved payment summary
                        </p>
                        <p className="text-sm text-brand-grey font-light leading-relaxed">
                          Vehicle: <span className="text-white font-bold">{applicationApprovalForm.approved_vehicle}</span>
                          {' '}| Stripe weekly charge:{' '}
                          <span className="text-white font-bold">
                            ${Number(applicationApprovalForm.approved_weekly_price || 0).toFixed(2)}/week
                          </span>
                          {' '}| Bond:{' '}
                          <span className="text-white font-bold">
                            ${Number(applicationApprovalForm.approved_bond || 0).toFixed(2)}
                          </span>
                          {' '}manual / not charged by Stripe | Bond status:{' '}
                          <span className="text-white font-bold">
                            {bondStatusLabels[applicationApprovalForm.bond_payment_status]}
                          </span>
                          {' '}| Bond method:{' '}
                          <span className="text-white font-bold">
                            {getBondMethodLabel(
                              getBondMethodForStatus(
                                applicationApprovalForm.bond_payment_status
                              )
                            )}
                          </span>
                          {applicationApprovalForm.rental_subscription_start_date && (
                            <>
                              {' '}| Subscription starts:{' '}
                              <span className="text-white font-bold">
                                {applicationApprovalForm.rental_subscription_start_date}
                              </span>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-brand-grey leading-relaxed">
                          Stripe will only charge weekly rental payments. Bond is recorded for the agreement and collected manually.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-4 border-t border-white/10 bg-white/5 p-4 sm:flex-row sm:p-8">
                <Button
                  appearance="secondary"
                  onClick={() => setSelectedApplication(null)}
                  className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest sm:!flex-1"
                >
                  Close
                </Button>
                {selectedApplication.status !== 'Cancelled' && (
                  <Button
                    appearance="outline"
                    onClick={() => {
                      setCancelApplicationReason('');
                      setIsCancelApplicationModalOpen(true);
                    }}
                    className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest !text-red-300 sm:!flex-1"
                  >
                    Cancel rental application
                  </Button>
                )}
                {selectedApplication.status !== 'Paid' &&
                  selectedApplication.status !== 'Payment Review' &&
                  selectedApplication.status !== 'Cancelled' && (
                  <Button
                    appearance="outline"
                    onClick={() =>
                      updateStatusMutation.mutate({ id: selectedApplication.id, status: 'Rejected' })
                    }
                    className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest !text-red-300 sm:!flex-1"
                  >
                    Reject Application
                  </Button>
                )}
                {selectedApplication.status !== 'Paid' &&
                  selectedApplication.status !== 'Rejected' &&
                  selectedApplication.status !== 'Payment Review' &&
                  selectedApplication.status !== 'Cancelled' && (
                  <Button
                    appearance="primary"
                    onClick={handleApproveSelectedApplication}
                    disabled={approveApplicationPaymentMutation.isPending}
                    className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest sm:!flex-[2]"
                    icon={
                      approveApplicationPaymentMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )
                    }
                  >
                    {selectedApplication.status === 'Approved'
                      ? 'Update Quote & Resend Payment Link'
                      : 'Approve & Send Payment Link'}
                  </Button>
                )}
                {selectedApplication.status === 'Paid' && (
                  <>
                    <Button
                      appearance="primary"
                      onClick={() => {
                        set_selected_agreement_application_id(selectedApplication.id.toString());
                        setSelectedApplication(null);
                        handleAdminTabChange('agreements');
                      }}
                      className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest sm:!flex-[2]"
                      icon={<FileText className="w-4 h-4" />}
                    >
                      Continue to Agreement
                    </Button>
                    <Button
                      appearance="secondary"
                      onClick={() => {
                        openTollNotices(selectedApplication.id.toString());
                        setSelectedApplication(null);
                      }}
                      className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest sm:!flex-[2]"
                      icon={<FileText className="w-4 h-4 text-brand-gold" />}
                    >
                      Create Toll Transfer Notice
                    </Button>
                  </>
                )}
                {selectedApplication.status === 'Payment Review' && (
                  <Button
                    appearance="primary"
                    onClick={handleRetrySelectedApplicationActivation}
                    disabled={retryPaymentReviewActivationMutation.isPending}
                    className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest sm:!flex-[2]"
                    icon={
                      retryPaymentReviewActivationMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )
                    }
                  >
                    Retry Payment Finalization
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCancelApplicationModalOpen && selectedApplication && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/60 backdrop-blur-xl sm:items-center sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4 sm:p-6">
                <div>
                  <h3 className="text-xl font-bold tracking-tighter text-white">
                    Cancel rental application
                  </h3>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-brand-grey">
                    Soft cancel and clear application-specific Stripe resources
                  </p>
                </div>
                <button
                  onClick={() => setIsCancelApplicationModalOpen(false)}
                  className="rounded-full bg-white/5 p-2 text-brand-grey hover:text-white"
                >
                  <XCircle />
                </button>
              </div>

              <div className="space-y-4 p-4 sm:p-6">
                <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm leading-7 text-red-50">
                  This will mark the application as cancelled, clear pending checkout state,
                  and expire only the Stripe resources linked to this application.
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-grey">
                    Cancellation reason
                  </label>
                  <textarea
                    value={cancelApplicationReason}
                    onChange={(event) => setCancelApplicationReason(event.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-white outline-none transition-all placeholder:text-brand-grey/60 focus:border-brand-gold"
                    placeholder="Optional: add a short reason for the audit trail"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-white/5 p-4 sm:flex-row sm:p-6">
                <button
                  onClick={() => setIsCancelApplicationModalOpen(false)}
                  className="w-full rounded-full border border-white/10 px-6 py-4 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/5 sm:flex-1"
                >
                  Keep application
                </button>
                <button
                  onClick={() =>
                    cancelApplicationMutation.mutate({
                      id: selectedApplication.id,
                      cancel_reason: cancelApplicationReason.trim() || undefined,
                    })
                  }
                  disabled={cancelApplicationMutation.isPending}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-red-500/30 bg-red-500/10 px-6 py-4 text-xs font-bold uppercase tracking-widest text-red-200 transition-all hover:bg-red-500/20 disabled:opacity-50 sm:flex-[2]"
                >
                  {cancelApplicationMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  Cancel rental application
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <VehicleFormModal
        form={vehicleForm}
        formErrors={vehicleFormErrors}
        hasUnsavedChanges={hasUnsavedVehicleChanges}
        imagePreviewUrl={vehicleImagePreview}
        isOpen={isVehicleModalOpen}
        isSubmitting={isVehicleSubmitting}
        isUploading={isUploadingVehicleImage}
        onArchiveOrRestore={() => {
          if (!editingCar) {
            return;
          }

          setVehicleDialogMode(editingCar.archived_at ? 'restore' : 'archive');
          setVehicleActionTarget(editingCar);
        }}
        onDelete={() => {
          if (!editingCar) {
            return;
          }

          setVehicleDialogMode('delete');
          setVehicleActionTarget(editingCar);
        }}
        onFieldChange={(field, value) => {
          setVehicleForm((current) => ({ ...current, [field]: value }));
          setVehicleFormErrors((current) => ({ ...current, [field]: undefined }));
        }}
        onImageNotify={showNotification}
        onImageReady={handleVehicleImagePrepared}
        onRemoveImage={handleRemoveVehicleImage}
        onRequestClose={requestCloseVehicleModal}
        onSave={handleSaveVehicle}
        vehicle={editingCar}
      />

      <VehicleActionDialog
        isLoading={vehicleDialogMode === 'discard' ? false : isVehicleActionPending}
        mode={vehicleDialogMode}
        onClose={closeVehicleActionDialog}
        onConfirm={handleConfirmVehicleAction}
        vehicle={vehicleDialogMode === 'discard' ? null : vehicleActionTarget}
      />

      {/* Agreement Modal */}
      <AnimatePresence>
        {isAgreementModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/60 backdrop-blur-xl sm:items-center sm:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4 sm:p-8">
                <div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Review Lease Agreement</h3>
                  <p className="text-[10px] text-brand-grey uppercase tracking-widest mt-1">Legally binding Markdown contract</p>
                </div>
                <button onClick={closeAgreementModal} className="rounded-full bg-white/5 p-2 text-brand-grey hover:text-white"><XCircle /></button>
              </div>
              <div className="flex-1 overflow-y-auto bg-white/[0.02] p-4 sm:p-12">
                <div className="prose prose-invert prose-brand max-w-none">
                  <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-brand-navy/50 p-4 font-sans text-xs text-brand-grey sm:p-8 sm:text-sm">
                    {agreementContent}
                  </pre>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-4 border-t border-white/10 bg-white/5 p-4 sm:flex-row sm:p-8">
                <button
                  onClick={closeAgreementModal}
                  className="w-full border border-white/10 py-5 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/5 sm:flex-1"
                >
                  {agreementModalMode === 'saved' ? 'Close' : 'Discard'}
                </button>
                {agreementModalMode === 'draft' && (
                  <button
                    onClick={() => {
                      const application_id = selected_agreement_application_id;
                      if (application_id) {
                        saveAgreementMutation.mutate({
                          application_id,
                          content: agreementContent,
                          vehicle_label:
                            selectedAgreementApplication?.approved_vehicle ||
                            'Approved vehicle',
                        });
                      }
                    }}
                    disabled={saveAgreementMutation.isPending}
                    className="flex w-full items-center justify-center gap-3 bg-brand-gold py-5 text-xs font-bold uppercase tracking-widest text-brand-navy shadow-lg transition-all hover:bg-brand-gold-light disabled:opacity-50 sm:flex-[2]"
                  >
                    {saveAgreementMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    Finalize & Save Agreement
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

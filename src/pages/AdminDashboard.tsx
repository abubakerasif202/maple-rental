import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Loader2,
  Trash2,
  FileText,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Users,
  Mail,
  Phone,
  MapPin,
  BadgeCheck,
  Menu,
} from 'lucide-react';
import { useLocation, useNavigate } from '../lib/router';
import {
  getDateRangeForPreset,
  type DateRangeValue,
} from '../components/admin/DateRangePicker';

import * as api from '../lib/api';
import { getApiErrorMessage } from '../lib/errorHandling';
import { completeAdminLogout } from '../lib/adminLogout';
import {
  Application,
  Rental,
  DashboardSummaryResponse,
  AdminDatasetResponse,
  OperationalCustomer,
  OperationalInvoice,
} from '../types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/admin/Sidebar';
import AccessibleDialog from '../components/admin/AccessibleDialog';
import { getTodayInAustralia } from '../../shared/applicationSubmission';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const OverviewTab = lazy(() => import('../components/admin/tabs/OverviewTab'));
const ApplicationsTab = lazy(() => import('../components/admin/tabs/ApplicationsTab'));
const RentalsTab = lazy(() => import('../components/admin/tabs/RentalsTab'));
const FinancialsTab = lazy(() => import('../components/admin/tabs/FinancialsTab'));
const CustomersTab = lazy(() => import('../components/admin/tabs/CustomersTab'));
const InvoicesTab = lazy(() => import('../components/admin/tabs/InvoicesTab'));
const AgreementsTab = lazy(() => import('../components/admin/tabs/AgreementsTab'));
const TollStatDecTab = lazy(() => import('../components/admin/tabs/TollStatDecTab'));
const MaintenanceTab = lazy(() => import('../components/admin/tabs/MaintenanceTab'));
const FleetImportsTab = lazy(() => import('../components/admin/tabs/FleetImportsTab'));

const OPERATIONAL_PAGE_SIZE = 25;
const adminTabs = ['dashboard', 'applications', 'rentals', 'customers', 'invoices', 'financials', 'agreements', 'toll-notices', 'maintenance', 'fleet-imports'] as const;
const getAdminTabFromPath = (pathname: string) => {
  const candidate = pathname.match(/^\/admin\/([^/]+)$/)?.[1];
  return adminTabs.find((tab) => tab === candidate) || 'dashboard';
};

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
  customers: 'Customers',
  dashboard: 'Overview',
  financials: 'Financials',
  invoices: 'Invoices',
  rentals: 'Rentals',
  'toll-notices': 'Toll Notices',
  maintenance: 'Maintenance',
  'fleet-imports': 'Fleet Register Import',
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
  const invalidateDashboardSummary = () =>
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  const { dispatchToast } = useToastController('maple-admin-toaster');
  const notificationTimeoutRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => getAdminTabFromPath(location.pathname));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
  const [agreementTemplateVersion, setAgreementTemplateVersion] = useState<number | null>(null);
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
  const [applicationPage, setApplicationPage] = useState(1);
  const [applicationPageSize, setApplicationPageSize] = useState(OPERATIONAL_PAGE_SIZE);
  const [applicationStatusFilters, setApplicationStatusFilters] = useState<string[]>([]);
  const [rentalPage, setRentalPage] = useState(1);
  const [rentalPageSize, setRentalPageSize] = useState(OPERATIONAL_PAGE_SIZE);
  const [customerPage, setCustomerPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(OPERATIONAL_PAGE_SIZE);
  const [financialDateRange, setFinancialDateRange] = useState<DateRangeValue>(() =>
    getDateRangeForPreset('last7')
  );
  const [agreementModalMode, setAgreementModalMode] = useState<'draft' | 'saved'>('draft');
  const debouncedCustomerSearch = useDebouncedValue(customerSearch.trim());
  const debouncedInvoiceSearch = useDebouncedValue(invoiceSearch.trim());

  useEffect(() => {
    if (location.pathname === '/admin/agreements') {
      setActiveTab('agreements');
      return;
    }

    if (location.pathname === '/admin/toll-notices') {
      setActiveTab('toll-notices');
      return;
    }
    setActiveTab(getAdminTabFromPath(location.pathname));
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
        : `/admin/${tab}`
    );
  };
  const debouncedApplicationSearch = useDebouncedValue(applicationSearch.trim());
  const debouncedRentalSearch = useDebouncedValue(rentalSearch.trim());

  const approvedApplicationStatusFilters = ['Approved', 'Paid'];

  useEffect(() => {
    setCustomerPage(1);
  }, [debouncedCustomerSearch]);

  useEffect(() => {
    setInvoicePage(1);
  }, [debouncedInvoiceSearch, invoicePageSize]);

  useEffect(() => {
    setApplicationPage(1);
  }, [debouncedApplicationSearch, applicationPageSize, applicationStatusFilters]);

  useEffect(() => {
    setRentalPage(1);
  }, [debouncedRentalSearch, rentalPageSize]);

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

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

  const shouldLoadStats = activeTab === 'dashboard' || activeTab === 'financials';
  const shouldLoadApplications =
    activeTab === 'applications' ||
    activeTab === 'agreements';
  const shouldLoadRentals = activeTab === 'rentals' || activeTab === 'toll-notices';
  const shouldLoadCustomers = activeTab === 'customers';
  const shouldLoadInvoices = activeTab === 'invoices';
  const shouldLoadWeeklyFinancials = activeTab === 'financials';
  const shouldLoadAgreements = activeTab === 'agreements';

  // Queries
  const summaryQuery = useQuery<DashboardSummaryResponse>({
    queryKey: ['dashboard-summary'],
    queryFn: ({ signal }) => api.fetchDashboardSummary(signal),
    enabled: shouldLoadStats,
  });

  const applicationsQuery = useQuery<AdminDatasetResponse<Application>>({
    queryKey: [
      'applications',
      debouncedApplicationSearch,
      applicationPage,
      applicationPageSize,
      applicationStatusFilters.join('|'),
    ],
    queryFn: ({ signal }) =>
      api.fetchApplications({
        page: applicationPage,
        pageSize: applicationPageSize,
        search: debouncedApplicationSearch,
        statuses: applicationStatusFilters,
      }, signal),
    enabled: shouldLoadApplications,
    placeholderData: (previousData) => previousData,
  });

  const approvedApplicationsQuery = useQuery<AdminDatasetResponse<Application>>({
    queryKey: ['approved-applications'],
    queryFn: ({ signal }) =>
      api.fetchApplications({
        page: 1,
        pageSize: 100,
        statuses: approvedApplicationStatusFilters,
      }, signal),
    enabled: shouldLoadAgreements,
    placeholderData: (previousData) => previousData,
  });

  const rentalsQuery = useQuery<AdminDatasetResponse<Rental>>({
    queryKey: ['rentals', debouncedRentalSearch, rentalPage, rentalPageSize],
    queryFn: ({ signal }) =>
      api.fetchRentals({
        page: rentalPage,
        pageSize: rentalPageSize,
        search: debouncedRentalSearch,
      }, signal),
    enabled: shouldLoadRentals,
    placeholderData: (previousData) => previousData,
  });

  // Paid subscriptions awaiting activation are fetched separately so rental
  // pagination and counts stay exact.
  const pendingActivationsQuery = useQuery({
    queryKey: ['pending-rental-activations', debouncedRentalSearch],
    queryFn: ({ signal }) =>
      api.fetchPendingRentalActivations({ search: debouncedRentalSearch }, signal),
    enabled: shouldLoadRentals,
  });

  const customerDatasetQuery = useQuery<AdminDatasetResponse<OperationalCustomer>>({
    queryKey: ['operational-customers', debouncedCustomerSearch, customerPage, OPERATIONAL_PAGE_SIZE],
    queryFn: ({ signal }) =>
      api.fetchOperationalCustomers({
        page: customerPage,
        pageSize: OPERATIONAL_PAGE_SIZE,
        search: debouncedCustomerSearch,
      }, signal),
    enabled: shouldLoadCustomers,
    placeholderData: (previousData) => previousData,
  });

  const invoiceDatasetQuery = useQuery<AdminDatasetResponse<OperationalInvoice>>({
    queryKey: ['operational-invoices', debouncedInvoiceSearch, invoicePage, invoicePageSize],
    queryFn: ({ signal }) =>
      api.fetchOperationalInvoices({
        page: invoicePage,
        pageSize: invoicePageSize,
        search: debouncedInvoiceSearch,
      }, signal),
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
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => api.updateApplicationStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['approved-applications'] });
      invalidateDashboardSummary();
      showNotification('Application status updated', 'success');
    },
    onError: (error) =>
      showNotification(getApiErrorMessage(error, 'Failed to update status'), 'error'),
  });

  const cancelApplicationMutation = useMutation({
    mutationFn: ({ id, cancel_reason }: { id: string; cancel_reason?: string }) =>
      api.cancelApplication(id, { cancel_reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['approved-applications'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      invalidateDashboardSummary();
      setSelectedApplication(null);
      setIsCancelApplicationModalOpen(false);
      setCancelApplicationReason('');
      showNotification('Application cancelled successfully', 'success');
    },
    onError: (error) =>
      showNotification(getApiErrorMessage(error, 'Failed to cancel application'), 'error'),
  });

  const saveAgreementMutation = useMutation({
    mutationFn: (payload: { agreement_template_version?: number | null; application_id: string; content: string; vehicle_label?: string | null }) =>
      api.saveLeaseAgreement(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['approved-applications'] });
      invalidateDashboardSummary();
      setIsAgreementModalOpen(false);
      setAgreementModalMode('draft');
      showNotification('Agreement saved successfully', 'success');
    },
    onError: (error) =>
      showNotification(getApiErrorMessage(error, 'Failed to save agreement'), 'error'),
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
      queryClient.invalidateQueries({ queryKey: ['approved-applications'] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      invalidateDashboardSummary();
    },
  });

  const generateCheckoutLinkMutation = useMutation({
    mutationFn: (payload: { application_id: string }) =>
      api.createVehicleCheckoutLink(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['approved-applications'] });
      invalidateDashboardSummary();
    },
  });

  const retryPaymentReviewActivationMutation = useMutation({
    mutationFn: (id: string) => api.retryApplicationPaymentActivation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['approved-applications'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      invalidateDashboardSummary();
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
      invalidateDashboardSummary();
      showNotification('Stripe subscription cancellation updated.', 'success');
    },
    onError: (error) =>
      showNotification(
        getApiErrorMessage(error, 'Failed to cancel Stripe subscription'),
        'error'
      ),
  });

  const activateRentalMutation = useMutation({
    mutationFn: (applicationId: string) => api.activateRental(applicationId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      queryClient.invalidateQueries({ queryKey: ['pending-rental-activations'] });
      queryClient.invalidateQueries({ queryKey: ['operational-customers'] });
      invalidateDashboardSummary();
      showNotification(
        result.created
          ? 'Rental activated.'
          : 'This subscription already has a live rental.',
        'success',
      );
    },
    onError: (error) => showNotification(getApiErrorMessage(error, 'Failed to activate rental.'), 'error'),
  });

  const handleLogout = async () => {
    try {
      await completeAdminLogout({
        clearClientState: () => queryClient.clear(),
        logout: api.logoutAdmin,
        redirectToLogin: () => navigate('/admin/login', { replace: true }),
      });
    } catch (error) {
      console.error('Logout error:', error);
      const logoutError = getApiErrorMessage(error, 'Logout failed.');
      showNotification(
        `${logoutError} Your admin session is still active. Please retry.`,
        'error'
      );
    }
  };

  const handleGenerateAgreement = async () => {
    const application_id = selected_agreement_application_id;
    const selectedApplication =
      approvedApplications.find((a) => a.id === application_id) ||
      applications.find((a) => a.id === application_id);

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
        selectedApplication.approved_vehicle?.trim() || 'Registration not recorded';

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
      setAgreementTemplateVersion(res.agreementTemplateVersion);
      setAgreementModalMode('draft');
      setIsAgreementModalOpen(true);
    } catch (err) {
      showNotification(getApiErrorMessage(err, 'Failed to generate agreement'), 'error');
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
      showNotification('Enter the registration number, bond, and weekly payment amounts.', 'error');
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

  const summary = summaryQuery.data;
  const applicationsDataset = applicationsQuery.data;
  const approvedApplicationsDataset = approvedApplicationsQuery.data;
  const rentalsDataset = rentalsQuery.data;
  const applications = applicationsDataset?.items || [];
  const approvedApplications = approvedApplicationsDataset?.items || [];
  const rentals = rentalsDataset?.items || [];
  const customerDataset = customerDatasetQuery.data;
  const invoiceDataset = invoiceDatasetQuery.data;
  const weeklyFinancials = weeklyFinancialsQuery.data;
  const savedAgreements = savedAgreementsQuery.data || [];

  useEffect(() => {
    const serverPage = applicationsDataset?.page;
    if (
      !applicationsQuery.isSuccess ||
      applicationsQuery.isPlaceholderData ||
      typeof serverPage !== 'number' ||
      !Number.isInteger(serverPage) ||
      serverPage < 1 ||
      serverPage === applicationPage
    ) {
      return;
    }

    queryClient.setQueryData(
      [
        'applications',
        debouncedApplicationSearch,
        serverPage,
        applicationPageSize,
        applicationStatusFilters.join('|'),
      ],
      applicationsDataset,
    );
    setApplicationPage(serverPage);
  }, [
    applicationPage,
    applicationPageSize,
    applicationStatusFilters,
    applicationsDataset,
    applicationsQuery.isPlaceholderData,
    applicationsQuery.isSuccess,
    debouncedApplicationSearch,
    queryClient,
  ]);

  useEffect(() => {
    const serverPage = rentalsDataset?.page;
    if (
      !rentalsQuery.isSuccess ||
      rentalsQuery.isPlaceholderData ||
      typeof serverPage !== 'number' ||
      !Number.isInteger(serverPage) ||
      serverPage < 1 ||
      serverPage === rentalPage
    ) {
      return;
    }

    queryClient.setQueryData(
      ['rentals', debouncedRentalSearch, serverPage, rentalPageSize],
      rentalsDataset,
    );
    setRentalPage(serverPage);
  }, [
    debouncedRentalSearch,
    queryClient,
    rentalPage,
    rentalPageSize,
    rentalsDataset,
    rentalsQuery.isPlaceholderData,
    rentalsQuery.isSuccess,
  ]);

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
  const weeklyFinancialsError =
    shouldLoadWeeklyFinancials && weeklyFinancialsQuery.isError && !weeklyFinancials
      ? getApiErrorMessage(weeklyFinancialsQuery.error, 'Failed to load weekly financials.')
      : null;
  const applicationsError =
    shouldLoadApplications && applicationsQuery.isError && !applicationsDataset
      ? getApiErrorMessage(applicationsQuery.error, 'Failed to load applications.')
      : null;
  const rentalsError =
    shouldLoadRentals && rentalsQuery.isError && !rentalsDataset
      ? getApiErrorMessage(rentalsQuery.error, 'Failed to load rentals.')
      : null;
  const isLoadingApplications =
    shouldLoadApplications && applicationsQuery.isPending && !applicationsDataset;
  const isFetchingApplications = shouldLoadApplications && applicationsQuery.isFetching;
  const isLoadingRentals = shouldLoadRentals && rentalsQuery.isPending && !rentalsDataset;
  const isFetchingRentals = shouldLoadRentals && rentalsQuery.isFetching;
  const applicationsCurrentPage = applicationsQuery.isPlaceholderData
    ? applicationPage
    : applicationsDataset?.page || applicationPage;
  const applicationsTotalItems = applicationsDataset?.totalItems || 0;
  const applicationsTotalPages = applicationsDataset?.totalPages || 1;
  const rentalsCurrentPage = rentalsQuery.isPlaceholderData
    ? rentalPage
    : rentalsDataset?.page || rentalPage;
  const rentalsTotalItems = rentalsDataset?.totalItems || 0;
  const rentalsTotalPages = rentalsDataset?.totalPages || 1;
  const pendingActivations = pendingActivationsQuery.data?.items || [];
  const selectedAgreementApplication =
    approvedApplications.find((app) => app.id === selected_agreement_application_id) ||
    applications.find((app) => app.id === selected_agreement_application_id);
  const canCopyVehicleCheckoutLink =
    Boolean(selectedAgreementApplication) &&
    selectedAgreementApplication?.status === 'Approved';
  const formatCurrency = (value?: number | string | null) =>
    new Intl.NumberFormat('en-AU', {
      currency: 'AUD',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(Number(value ?? 0));
  const lastUpdated = summary?.summary_generated_at || null;
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
        handleLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
        setActiveTab={handleAdminTabChange}
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
          <div className="flex items-center gap-2">
            {activeTab === 'dashboard' && (
              <button
                type="button"
                onClick={() => summaryQuery.refetch()}
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white transition-all hover:bg-white/10"
                aria-label="Refresh dashboard summary"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open admin navigation"
              aria-expanded={isSidebarOpen}
              aria-controls="admin-navigation"
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white transition-all hover:bg-white/10"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        <Suspense fallback={renderLoadingPanel('Loading admin workspace...')}>
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <OverviewTab
              applications={applications}
              isError={summaryQuery.isError && !summary}
              isLoading={summaryQuery.isPending && !summary}
              lastUpdated={lastUpdated}
              onRefresh={() => summaryQuery.refetch()}
              setActiveTab={handleAdminTabChange}
              summary={summary}
            />
          )}

          {activeTab === 'applications' && (
            <ApplicationsTab
              applicationSearch={applicationSearch}
              applications={applications}
              applicationsError={applicationsError}
              applicationsPage={applicationsCurrentPage}
              applicationsPageSize={applicationPageSize}
              applicationsTotalItems={applicationsTotalItems}
              applicationsTotalPages={applicationsTotalPages}
              clearApplicationStatuses={() => setApplicationStatusFilters([])}
              isFetchingApplications={isFetchingApplications}
              isLoadingApplications={isLoadingApplications}
              onApplicationPageChange={setApplicationPage}
              onApplicationPageSizeChange={(pageSize) => {
                setApplicationPageSize(pageSize);
                setApplicationPage(1);
              }}
              setApplicationSearch={setApplicationSearch}
              setSelectedApplication={setSelectedApplication}
              statusFilters={applicationStatusFilters}
              toggleApplicationStatus={(status) =>
                setApplicationStatusFilters((current) =>
                  current.includes(status)
                    ? current.filter((item) => item !== status)
                    : [...current, status]
                )
              }
            />
          )}

          {activeTab === 'rentals' && (
            <RentalsTab
              isFetchingRentals={isFetchingRentals}
              isLoadingRentals={isLoadingRentals}
              onCancelSubscription={(payload) =>
                cancelRentalSubscriptionMutation.mutateAsync(payload)
              }
              activatingApplicationId={
                activateRentalMutation.isPending
                  ? activateRentalMutation.variables ?? null
                  : null
              }
              pendingActivations={pendingActivations}
              onActivateRental={(applicationId) =>
                activateRentalMutation.mutateAsync(applicationId)
              }
              onCreateTollNotice={(rental) =>
                openTollNotices(
                  String(rental.application_id || rental.applicant_name || rental.car_name || '')
                )
              }
              onRentalPageChange={setRentalPage}
              onRentalPageSizeChange={(pageSize) => {
                setRentalPageSize(pageSize);
                setRentalPage(1);
              }}
              rentalSearch={rentalSearch}
              setRentalSearch={setRentalSearch}
              rentals={rentals}
              rentalsError={rentalsError}
              rentalsPage={rentalsCurrentPage}
              rentalsPageSize={rentalPageSize}
              rentalsTotalItems={rentalsTotalItems}
              rentalsTotalPages={rentalsTotalPages}
            />
          )}

          {activeTab === 'financials' && (
            <FinancialsTab
              dateRange={financialDateRange}
              isLoadingWeeklyFinancials={isLoadingWeeklyFinancials}
              weeklyFinancialsError={weeklyFinancialsError}
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
              deferredCustomerSearch={debouncedCustomerSearch}
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
              deferredInvoiceSearch={debouncedInvoiceSearch}
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
            />
          )}

          {activeTab === 'toll-notices' && (
            <TollStatDecTab initialSearch={tollNoticeInitialSearch} />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceTab />
          )}

          {activeTab === 'fleet-imports' && (
            <FleetImportsTab />
          )}
        </AnimatePresence>
        </Suspense>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            role={notification.type === 'success' ? 'status' : 'alert'}
            aria-live={notification.type === 'success' ? 'polite' : 'assertive'}
            aria-atomic="true"
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
        {selectedApplication && !isCancelApplicationModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/60 backdrop-blur-xl sm:items-center sm:p-6">
            <AccessibleDialog
              ariaLabelledBy="application-review-title"
              onClose={() => setSelectedApplication(null)}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4 sm:p-8">
                <div>
                  <h3 id="application-review-title" className="text-xl font-bold text-white uppercase tracking-tighter">Review Application</h3>
                  <p className="text-[10px] text-brand-grey uppercase tracking-widest mt-1">Driver profile and submitted documents</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedApplication(null)}
                  aria-label="Close application review"
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
                  {[
                    {
                      document: 'license_photo' as const,
                      label: 'Licence Front Photo',
                      buttonLabel: 'Open Licence Front Photo',
                    },
                    {
                      document: 'license_back_photo' as const,
                      label: 'Licence Back Photo',
                      buttonLabel: 'Open Licence Back Photo',
                    },
                  ].map(({ document, label, buttonLabel }) => (
                    <div
                      key={document}
                      className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4"
                    >
                      <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                        {label}
                      </h4>
                      <Button
                        type="button"
                        appearance={document === 'license_back_photo' ? 'secondary' : 'primary'}
                        onClick={() => handleOpenApplicationDocument(document)}
                        disabled={openingDocument !== null}
                        className="!min-h-12 !w-full !font-bold !uppercase !tracking-widest"
                        icon={
                          openingDocument === document ? (
                            <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
                          ) : (
                            <ExternalLink className="w-4 h-4 text-brand-gold" />
                          )
                        }
                      >
                        {buttonLabel}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                    <h4 className="text-[10px] font-bold text-brand-grey uppercase tracking-widest">
                      Passport or Uber Profile Screenshot
                    </h4>
                    <Button
                      type="button"
                      appearance="primary"
                      onClick={() =>
                        handleOpenApplicationDocument('passport_or_uber_profile_screenshot')
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
                          Confirm the registration number, record the manual bond, and email a fresh secure Stripe payment link for weekly rent only.
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
                        label="Registration number"
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
                          placeholder="ABC123"
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
                          Registration: <span className="text-white font-bold">{applicationApprovalForm.approved_vehicle}</span>
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
            </AccessibleDialog>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCancelApplicationModalOpen && selectedApplication && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/60 backdrop-blur-xl sm:items-center sm:p-6">
            <AccessibleDialog
              ariaLabelledBy="cancel-application-title"
              onClose={() => {
                if (!cancelApplicationMutation.isPending) {
                  setIsCancelApplicationModalOpen(false);
                }
              }}
              className="w-full max-w-2xl overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4 sm:p-6">
                <div>
                  <h3 id="cancel-application-title" className="text-xl font-bold tracking-tighter text-white">
                    Cancel rental application
                  </h3>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-brand-grey">
                    Soft cancel and clear application-specific Stripe resources
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCancelApplicationModalOpen(false)}
                  aria-label="Close application cancellation"
                  disabled={cancelApplicationMutation.isPending}
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
                  <label
                    htmlFor="application-cancellation-reason"
                    className="text-[10px] font-bold uppercase tracking-widest text-brand-grey"
                  >
                    Cancellation reason
                  </label>
                  <textarea
                    id="application-cancellation-reason"
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
                  type="button"
                  onClick={() => setIsCancelApplicationModalOpen(false)}
                  disabled={cancelApplicationMutation.isPending}
                  className="w-full rounded-full border border-white/10 px-6 py-4 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/5 sm:flex-1"
                >
                  Keep application
                </button>
                <button
                  type="button"
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
            </AccessibleDialog>
          </div>
        )}
      </AnimatePresence>

      {/* Agreement Modal */}
      <AnimatePresence>
        {isAgreementModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy/60 backdrop-blur-xl sm:items-center sm:p-6">
            <AccessibleDialog
              animationScale={0.9}
              ariaLabelledBy="lease-agreement-review-title"
              onClose={closeAgreementModal}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-brand-navy shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4 sm:p-8">
                <div>
                  <h3 id="lease-agreement-review-title" className="text-xl font-bold text-white uppercase tracking-tighter">Review Lease Agreement</h3>
                  <p className="text-[10px] text-brand-grey uppercase tracking-widest mt-1">Legally binding Markdown contract</p>
                </div>
                <button type="button" onClick={closeAgreementModal} aria-label="Close lease agreement review" className="rounded-full bg-white/5 p-2 text-brand-grey hover:text-white"><XCircle /></button>
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
                  type="button"
                  onClick={closeAgreementModal}
                  className="w-full border border-white/10 py-5 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/5 sm:flex-1"
                >
                  {agreementModalMode === 'saved' ? 'Close' : 'Discard'}
                </button>
                {agreementModalMode === 'draft' && (
                  <button
                    type="button"
                    onClick={() => {
                      const application_id = selected_agreement_application_id;
                      if (application_id) {
                        saveAgreementMutation.mutate({
                          agreement_template_version: agreementTemplateVersion,
                          application_id,
                          content: agreementContent,
                          vehicle_label:
                            selectedAgreementApplication?.approved_vehicle ||
                            'Registration not recorded',
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
            </AccessibleDialog>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

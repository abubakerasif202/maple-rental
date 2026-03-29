import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FleetSort = 'featured' | 'rate_desc' | 'rate_asc' | 'year_desc';
export type FleetStatusFilter = 'all' | 'available' | 'reserved' | 'active' | 'maintenance' | 'inactive';
export type AdminPaymentFilter = 'all' | 'paid' | 'failed';

type ViewState = {
  fleetQuery: string;
  fleetStatusFilter: FleetStatusFilter;
  fleetSort: FleetSort;
  adminApplicationQuery: string;
  adminVehicleFilter: string;
  adminPaymentFilter: AdminPaymentFilter;
  setFleetState: (payload: {
    query?: string;
    statusFilter?: FleetStatusFilter;
    sortBy?: FleetSort;
  }) => void;
  setAdminState: (payload: {
    applicationQuery?: string;
    vehicleFilter?: string;
    paymentFilter?: AdminPaymentFilter;
  }) => void;
};

export const useViewStateStore = create<ViewState>()(
  persist(
    (set) => ({
      fleetQuery: '',
      fleetStatusFilter: 'all',
      fleetSort: 'featured',
      adminApplicationQuery: '',
      adminVehicleFilter: 'all',
      adminPaymentFilter: 'all',
      setFleetState: ({ query, statusFilter, sortBy }) =>
        set((state) => ({
          fleetQuery: query ?? state.fleetQuery,
          fleetStatusFilter: statusFilter ?? state.fleetStatusFilter,
          fleetSort: sortBy ?? state.fleetSort,
        })),
      setAdminState: ({ applicationQuery, vehicleFilter, paymentFilter }) =>
        set((state) => ({
          adminApplicationQuery: applicationQuery ?? state.adminApplicationQuery,
          adminVehicleFilter: vehicleFilter ?? state.adminVehicleFilter,
          adminPaymentFilter: paymentFilter ?? state.adminPaymentFilter,
        })),
    }),
    {
      name: 'maple-view-state',
    },
  ),
);

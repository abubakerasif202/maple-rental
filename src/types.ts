import { z } from 'zod';

// --- Database Interfaces ---

export interface Admin {
  id: number;
  username: string;
  password?: string;
}

export const CAR_STATUSES = ['Available', 'Reserved', 'Rented', 'Maintenance'] as const;
export type CarStatus = (typeof CAR_STATUSES)[number];

export interface Car {
  id: number;
  name: string;
  modelYear: number;
  weeklyPrice: number;
  bond: number;
  status: CarStatus;
  image: string;
}

export const APPLICATION_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: number;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string | null;
  uberStatus: string;
  experience: string | null;
  address: string;
  weeklyBudget: string | null;
  intendedStartDate: string | null;
  licensePhoto: string | null;
  uberScreenshot: string | null;
  status: ApplicationStatus;
  createdAt: string;
}

export const RENTAL_STATUSES = ['Active', 'Completed', 'Cancelled'] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export interface Rental {
  id: number;
  applicationId: number;
  carId: number;
  startDate: string;
  weeklyPrice: number;
  status: RentalStatus;
  createdAt: string;
  // Joined fields
  driverName?: string;
  carName?: string;
}

export const BOOKING_STATUSES = ['Pending', 'Paid', 'Cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface Booking {
  id: number;
  carId: number;
  customerName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: BookingStatus;
  stripeSessionId: string | null;
  createdAt: string;
}

// --- Zod Schemas for Validation ---

export const LoginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(256),
});

export const CarSchema = z.object({
  name: z.string().min(1).max(180),
  modelYear: z.number().int().positive(),
  weeklyPrice: z.number().positive(),
  bond: z.number().positive(),
  status: z.enum(CAR_STATUSES).default('Available'),
  image: z.string().url().max(2000),
});

export const ApplicationSchema = z.object({
  name: z.string().min(1).max(180),
  phone: z.string().min(1).max(40),
  email: z.string().email().max(320),
  licenseNumber: z.string().min(1).max(80),
  licenseExpiry: z.string().nullable().optional(),
  uberStatus: z.string().min(1).max(80),
  experience: z.string().nullable().optional(),
  address: z.string().min(1).max(300),
  weeklyBudget: z.string().nullable().optional(),
  intendedStartDate: z.string().nullable().optional(),
  licensePhoto: z.string().nullable().optional(),
  uberScreenshot: z.string().nullable().optional(),
});

export const ApplicationStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
});

export const RentalSchema = z.object({
  applicationId: z.number().int().positive(),
  carId: z.number().int().positive(),
  startDate: z.string().min(1).max(40),
  weeklyPrice: z.number().positive(),
});

export const RentalStatusSchema = z.object({
  status: z.enum(RENTAL_STATUSES),
});

export const BookingSchema = z.object({
  customerName: z.string().min(1).max(180),
  email: z.string().email().max(320),
  phone: z.string().min(1).max(40),
  licenseNumber: z.string().min(1).max(80),
  carId: z.number().int().positive(),
  startDate: z.string().min(1).max(40),
  endDate: z.string().min(1).max(40),
});

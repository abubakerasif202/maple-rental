export const COMPLETED_RENTAL_STATUS = 'Completed' as const;
export const CANCELLED_RENTAL_STATUS = 'Cancelled' as const;

export const isTerminalRentalStatus = (status: string) =>
  status === COMPLETED_RENTAL_STATUS || status === CANCELLED_RENTAL_STATUS;

/**
 * Completed records an intentional end to a legitimate rental relationship.
 * Cancelled is reserved for an involuntary or invalidated rental relationship.
 */
export const getRequestedCancellationRentalStatus = () =>
  COMPLETED_RENTAL_STATUS;

export const getDeletedSubscriptionRentalStatus = (
  cancellationWasRequested: boolean,
) =>
  cancellationWasRequested
    ? COMPLETED_RENTAL_STATUS
    : CANCELLED_RENTAL_STATUS;

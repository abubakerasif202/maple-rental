import express from "express";
import { z } from "zod";

import { db } from "../db/index.js";
import { authenticateAdmin } from "../middleware/auth.js";
import { getStripeClient } from "../stripeClient.js";
import {
  getRentalCreatedAtColumn,
  getApplicationListSelectColumns,
  getRentalSelectColumns,
  getSchemaCompat,
  getApplicationImportedDataSelectColumns,
} from "../schemaCompat.js";
import {
  getImportedApplicationIdSet,
  isImportedApplicationRecord,
} from "../importedDataFilters.js";

const router = express.Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean(),
  confirm: z.literal("CANCEL SUBSCRIPTION"),
  reason: z.string().trim().max(500).optional(),
});

const getRentalStripeSubscriptionId = (rental: Record<string, unknown>) =>
  String(rental.stripe_subscription_id || rental.stripeSubscriptionId || "").trim();

const buildCancellationIdempotencyKey = ({
  cancelAtPeriodEnd,
  rentalId,
  subscriptionId,
}: {
  cancelAtPeriodEnd: boolean;
  rentalId: string;
  subscriptionId: string;
}) =>
  `admin-rental-subscription-cancel:${rentalId}:${subscriptionId}:${
    cancelAtPeriodEnd ? "period-end" : "immediate"
  }`;

const parsePositiveInt = (value: unknown, fallback: number) => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const normalizeSearchTerm = (value: unknown) => {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (typeof normalized !== "string") {
    return "";
  }

  return normalized.replace(/[^a-zA-Z0-9@.+\-\s]/g, " ").replace(/\s+/g, " ").trim();
};

const normalizeExact = (value: unknown) => String(value ?? "").trim().toLowerCase();

const splitFullName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { given_names: "", surname: parts[0] || "" };
  }

  return {
    given_names: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1],
  };
};

const parseAddressParts = (address: string | null | undefined) => {
  const value = String(address || "").trim();
  const match = value.match(
    /^(.*?)[,\s]+([A-Za-z ]+)\s+(NSW|ACT|VIC|QLD|SA|WA|TAS|NT)\s+(\d{4})$/i,
  );

  if (!match) {
    return {
      address: value,
      postcode: "",
      state: "NSW",
      suburb: "",
    };
  }

  return {
    address: match[1]?.replace(/,\s*$/, "").trim() || value,
    postcode: match[4] || "",
    state: (match[3] || "NSW").toUpperCase(),
    suburb: (match[2] || "").trim().toUpperCase(),
  };
};

const applyRentalImportFilters = (query: any, importedApplicationIds: Set<string>) => {
  let nextQuery = query.is("legacy_application_id", null);

  if (importedApplicationIds.size > 0) {
    const quotedIds = [...importedApplicationIds].map((id) => `"${id}"`).join(",");
    nextQuery = nextQuery.not("application_id", "in", `(${quotedIds})`);
  }

  return nextQuery;
};

const applyRentalVehicleSearch = (query: any, searchTerm: string) => {
  if (!searchTerm) {
    return query;
  }

  return query.ilike("vehicle_registration", `%${searchTerm}%`);
};

const applyApplicationSearch = (query: any, searchTerm: string) => {
  if (!searchTerm) {
    return query;
  }

  const pattern = `%${searchTerm}%`;
  return query.or(
    [
      `name.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `license_number.ilike.${pattern}`,
      `approved_vehicle.ilike.${pattern}`,
    ].join(","),
  );
};

const fetchImportedApplicationIds = async () => {
  const importedSelectColumns = await getApplicationImportedDataSelectColumns();
  const { data, error } = await db
    .from("applications")
    .select(importedSelectColumns);

  if (error) {
    throw error;
  }

  return getImportedApplicationIdSet((data || []) as Array<Record<string, any>>);
};

const fetchMatchingApplicationIds = async (
  searchTerm: string,
  importedApplicationIds: Set<string>,
) => {
  if (!searchTerm) {
    return new Set<string>();
  }

  const { data, error } = await applyApplicationSearch(
    applyApplicationImportFilters(db.from("applications").select("id")),
    searchTerm,
  );

  if (error) {
    throw error;
  }

  const ids = (data || [])
    .map((row: any) => String(row.id || "").trim())
    .filter(Boolean)
    .filter((id) => !importedApplicationIds.has(id));

  return new Set(ids);
};

const applyApplicationImportFilters = (query: any) =>
  query
    .is("legacy_id", null)
    .not("email", "ilike", "%@example.invalid")
    .not("phone", "eq", "0000000000")
    .not("license_number", "ilike", "legacy-%")
    .not("experience", "ilike", "%imported from live fleet data%")
    .not("experience", "ilike", "%legacy renter import%");

const fetchMatchingVehicleRentalIds = async (
  searchTerm: string,
  importedApplicationIds: Set<string>,
) => {
  if (!searchTerm) {
    return new Set<string>();
  }

  const { data, error } = await applyRentalVehicleSearch(
    applyRentalImportFilters(
      db.from("rentals").select("id"),
      importedApplicationIds,
    ),
    searchTerm,
  );

  if (error) {
    throw error;
  }

  return new Set(
    (data || [])
      .map((row: any) => String(row.id || "").trim())
      .filter(Boolean),
  );
};

const loadRentalRowsByIds = async (rentalIds: Set<string>) => {
  if (rentalIds.size === 0) {
    return [];
  }

  const selectColumns = await getRentalSelectColumns({
    includeStripeFields: true,
  });
  const { data, error } = await db
    .from("rentals")
    .select(selectColumns)
    .in("id", [...rentalIds]);

  if (error) {
    throw error;
  }

  return ((data || []) as Array<Record<string, any>>).sort((left, right) => {
    const leftCreated = new Date(String(left.created_at || 0)).getTime();
    const rightCreated = new Date(String(right.created_at || 0)).getTime();
    return rightCreated - leftCreated;
  });
};

const loadApplicationRowsByIds = async (applicationIds: string[]) => {
  if (applicationIds.length === 0) {
    return new Map<string, Record<string, any>>();
  }

  const selectColumns = await getApplicationListSelectColumns();
  const { data, error } = await db
    .from("applications")
    .select(selectColumns)
    .in("id", applicationIds);

  if (error) {
    throw error;
  }

  const rows = ((data || []) as Array<Record<string, any>>).filter(
    (application) => !isImportedApplicationRecord(application),
  );

  return new Map(rows.map((application) => [String(application.id), application]));
};

const formatRentalRows = async (rentals: Array<Record<string, any>>) => {
  const applicationIds = [
    ...new Set(
      rentals
        .map((rental) => String(rental.application_id || rental.applicationId || ""))
        .filter(Boolean),
    ),
  ];
  const applicationsById = await loadApplicationRowsByIds(applicationIds);

  return rentals.map((rental: any) => {
    const applicationId = String(rental.application_id || rental.applicationId || "");
    const application = applicationsById.get(applicationId);
    const vehicleRegistration = String(
      rental.vehicle_registration ||
        rental.vehicleRegistration ||
        application?.approved_vehicle ||
        application?.approvedVehicle ||
        "",
    ).trim();

    return {
      ...rental,
      application_id: applicationId,
      applicant_name: application?.name || null,
      car_name: vehicleRegistration,
      vehicle_registration: vehicleRegistration,
    };
  });
};

export const loadAdminRentalDataset = async ({
  page,
  pageSize,
  search,
}: {
  page: number;
  pageSize: number;
  search: string;
}) => {
  const importedApplicationIds = await fetchImportedApplicationIds();
  const orderColumn = await getRentalCreatedAtColumn();
  const searchTerm = normalizeSearchTerm(search);

  if (searchTerm) {
    const [applicationIds, vehicleRentalIds] = await Promise.all([
      fetchMatchingApplicationIds(searchTerm, importedApplicationIds),
      fetchMatchingVehicleRentalIds(searchTerm, importedApplicationIds),
    ]);

    const matchingRentalIds = new Set<string>();
    if (applicationIds.size > 0) {
      const { data, error } = await applyRentalImportFilters(
        db.from("rentals").select("id, application_id, created_at"),
        importedApplicationIds,
      ).in("application_id", [...applicationIds]);

      if (error) {
        throw error;
      }

      for (const rental of (data || []) as Array<Record<string, any>>) {
        matchingRentalIds.add(String(rental.id || "").trim());
      }
    }

    for (const rentalId of vehicleRentalIds as Set<string>) {
      matchingRentalIds.add(rentalId);
    }

    const matchedRentalRows = await loadRentalRowsByIds(matchingRentalIds);
    const formattedRentals = await formatRentalRows(matchedRentalRows);
    const totalItems = formattedRentals.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const rangeStart = (currentPage - 1) * pageSize;
    const items = formattedRentals.slice(rangeStart, rangeStart + pageSize);

    return {
      items,
      page: currentPage,
      pageSize,
      total: totalItems,
      totalItems,
      totalPages,
    };
  }

  const countQuery = applyRentalImportFilters(
    db.from("rentals").select("id", { count: "exact", head: true }),
    importedApplicationIds,
  );
  const { count, error: countError } = await countQuery;
  if (countError) {
    throw countError;
  }

  const totalItems = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = (currentPage - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;
  const selectColumns = await getRentalSelectColumns({
    includeStripeFields: true,
  });
  const { data, error } = await applyRentalImportFilters(
    db.from("rentals").select(selectColumns),
    importedApplicationIds,
  )
    .order(orderColumn, { ascending: false })
    .range(rangeStart, rangeEnd);

  if (error) {
    throw error;
  }

  const formattedRentals = await formatRentalRows((data || []) as Array<Record<string, any>>);

  return {
    items: formattedRentals,
    page: currentPage,
    pageSize,
    total: totalItems,
    totalItems,
    totalPages,
  };
};

export const loadRentalPrefillOptions = async (search: string) => {
  const dataset = await loadAdminRentalDataset({
    page: 1,
    pageSize: 50,
    search,
  });
  const applicationIds = [
    ...new Set(dataset.items.map((rental) => String(rental.application_id || "").trim()).filter(Boolean)),
  ];
  const [applicationsById, customersResult] = await Promise.all([
    loadApplicationRowsByIds(applicationIds),
    db
      .from("customers")
      .select("id, full_name, phone, email, date_of_birth, street, city, state, postcode"),
  ]);

  if (customersResult.error) {
    throw customersResult.error;
  }

  const customerRows = (customersResult.data || []) as Array<Record<string, any>>;
  const customerForApplication = (application: Record<string, any> | undefined) => {
    if (!application) {
      return null;
    }

    const email = normalizeExact(application.email);
    const phone = normalizeExact(application.phone);
    const name = normalizeExact(application.name);

    return (
      customerRows.find(
        (customer) =>
          (email && normalizeExact(customer.email) === email) ||
          (phone && normalizeExact(customer.phone) === phone) ||
          (name && normalizeExact(customer.full_name) === name),
      ) || null
    );
  };

  return dataset.items.map((rental) => {
    const fullName = String(rental.applicant_name || "").trim();
    const application = applicationsById.get(String(rental.application_id || ""));
    const customer = customerForApplication(application);
    const addressParts = parseAddressParts(
      String(customer?.street || "") || String(application?.address || ""),
    );
    const { given_names, surname } = splitFullName(
      String(customer?.full_name || application?.name || fullName || "").trim(),
    );
    const vehicleRegistration = String(rental.vehicle_registration || rental.car_name || "").trim();

    return {
      application_id: String(rental.application_id || ""),
      applicant_name: fullName,
      car_name: String(rental.car_name || vehicleRegistration),
      customer_id: customer?.id ? Number(customer.id) : null,
      nominee_address: addressParts.address,
      nominee_country: "AUSTRALIA",
      nominee_dob: customer?.date_of_birth || null,
      nominee_full_name: String(customer?.full_name || application?.name || fullName || "").trim(),
      nominee_given_names: given_names,
      nominee_phone: String(customer?.phone || application?.phone || "").trim(),
      nominee_postcode: customer?.postcode ? String(customer.postcode) : addressParts.postcode,
      nominee_state: customer?.state ? String(customer.state) : addressParts.state,
      nominee_suburb: customer?.city ? String(customer.city) : addressParts.suburb,
      rental_id: Number(rental.id),
      rental_status: String(rental.status || ""),
      vehicle_registration: vehicleRegistration,
      nominee_surname: surname,
    };
  });
};

router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = Math.min(
      parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const search = normalizeSearchTerm(req.query.search);
    const dataset = await loadAdminRentalDataset({ page, pageSize, search });
    res.json(dataset);
  } catch (error) {
    console.error("Fetch rentals error:", error);
    res.status(500).json({ error: "Failed to fetch rentals" });
  }
});

router.post("/:rentalId/cancel-subscription", authenticateAdmin, async (req, res) => {
  const parsed = cancelSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.issues,
    });
  }

  const rentalId = String(req.params.rentalId || "").trim();
  if (!rentalId) {
    return res.status(400).json({ error: "Rental ID is required" });
  }

  try {
    const { data: rental, error: rentalError } = await db
      .from("rentals")
      .select("*")
      .eq("id", rentalId)
      .single();

    if (rentalError || !rental) {
      return res.status(404).json({ error: "Rental not found" });
    }

    const stripeSubscriptionId = getRentalStripeSubscriptionId(
      rental as unknown as Record<string, unknown>,
    );
    if (!stripeSubscriptionId) {
      return res.status(400).json({
        error: "No Stripe subscription is linked to this rental.",
      });
    }

    const { cancelAtPeriodEnd, reason } = parsed.data;
    const stripe = getStripeClient();
    const idempotencyKey = buildCancellationIdempotencyKey({
      cancelAtPeriodEnd,
      rentalId,
      subscriptionId: stripeSubscriptionId,
    });
    const metadata = {
      admin_cancelled_by: String(req.admin?.email || "admin"),
      admin_cancellation_reason: reason || "",
      admin_cancellation_requested_at: new Date().toISOString(),
      maple_rental_id: rentalId,
    };

    const existingSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const subscription =
      existingSubscription.status === "canceled"
        ? existingSubscription
        : cancelAtPeriodEnd
          ? await stripe.subscriptions.update(
              stripeSubscriptionId,
              {
                cancel_at_period_end: true,
                metadata,
              },
              { idempotencyKey },
            )
          : await stripe.subscriptions.cancel(
              stripeSubscriptionId,
              {},
              { idempotencyKey },
            );

    if (!cancelAtPeriodEnd || existingSubscription.status === "canceled") {
      const compat = await getSchemaCompat();
      const payload: Record<string, unknown> = { status: "Cancelled" };
      payload[compat.coreMode === "camel" ? "endDate" : "end_date"] = new Date()
        .toISOString()
        .slice(0, 10);
      const updateResult = await db.from("rentals").update(payload).eq("id", rentalId);
      if (updateResult.error) {
        throw updateResult.error;
      }
    }

    console.info("Admin updated Stripe subscription cancellation", {
      adminEmail: req.admin?.email || null,
      cancelAtPeriodEnd,
      rentalId,
      stripeStatus: subscription.status,
      stripeSubscriptionId,
    });

    res.json({
      success: true,
      rentalId,
      stripeSubscriptionId,
      cancelAtPeriodEnd,
      stripeStatus: subscription.status,
      message: "Subscription cancellation updated.",
    });
  } catch (error) {
    console.error("Admin subscription cancellation error:", error);
    res.status(500).json({ error: "Failed to cancel Stripe subscription" });
  }
});

export default router;

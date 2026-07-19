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
} from "../schemaCompat.js";
import { isImportedApplicationRecord } from "../importedDataFilters.js";

const router = express.Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const RENTAL_APPLICATION_RELATION_SELECT = [
  "applications!inner(",
  [
    "id",
    "name",
    "phone",
    "email",
    "address",
    "approved_vehicle",
    "legacy_id",
    "license_number",
    "experience",
  ].join(", "),
  ")",
].join("");

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

const withRentalApplicationRelation = (selectColumns: string) =>
  `${selectColumns}, ${RENTAL_APPLICATION_RELATION_SELECT}`;

const applyNullSafeNotFilter = (
  query: any,
  column: string,
  operator: "eq" | "ilike",
  value: string,
  options?: { referencedTable?: string },
) => query.or(`${column}.is.null,${column}.not.${operator}.${value}`, options || {});

const applyRentalImportFilters = (query: any) =>
  applyNullSafeNotFilter(
    applyNullSafeNotFilter(
      applyNullSafeNotFilter(
        applyNullSafeNotFilter(
          applyNullSafeNotFilter(
            query.is("legacy_application_id", null).is("applications.legacy_id", null),
            "email",
            "ilike",
            "%@example.invalid",
            { referencedTable: "applications" },
          ),
          "phone",
          "eq",
          "0000000000",
          { referencedTable: "applications" },
        ),
        "license_number",
        "ilike",
        "legacy-%",
        { referencedTable: "applications" },
      ),
      "experience",
      "ilike",
      "%imported from live fleet data%",
      { referencedTable: "applications" },
    ),
    "experience",
    "ilike",
    "%legacy renter import%",
    { referencedTable: "applications" },
  );

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

const fetchMatchingApplicationIds = async (searchTerm: string) => {
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
    .filter(Boolean);

  return new Set(ids);
};

const applyApplicationImportFilters = (query: any) =>
  applyNullSafeNotFilter(
    applyNullSafeNotFilter(
      applyNullSafeNotFilter(
        applyNullSafeNotFilter(
          applyNullSafeNotFilter(
            query.is("legacy_id", null),
            "email",
            "ilike",
            "%@example.invalid",
          ),
          "phone",
          "eq",
          "0000000000",
        ),
        "license_number",
        "ilike",
        "legacy-%",
      ),
      "experience",
      "ilike",
      "%imported from live fleet data%",
    ),
    "experience",
    "ilike",
    "%legacy renter import%",
  );

const fetchMatchingVehicleRentalRows = async (searchTerm: string) => {
  if (!searchTerm) {
    return [];
  }

  const selectColumns = await getRentalSelectColumns({
    includeStripeFields: true,
  });
  const { data, error } = await applyRentalVehicleSearch(
    applyRentalImportFilters(db.from("rentals").select(withRentalApplicationRelation(selectColumns))),
    searchTerm,
  );

  if (error) {
    throw error;
  }

  return (data || []) as Array<Record<string, any>>;
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

const getEmbeddedApplication = (rental: Record<string, any>) => {
  const embedded = rental.applications;
  if (Array.isArray(embedded)) {
    return embedded[0] || null;
  }

  return embedded && typeof embedded === "object" ? embedded : null;
};

const formatRentalRowsWithApplications = async (rentals: Array<Record<string, any>>) => {
  const embeddedApplicationsById = new Map<string, Record<string, any>>();
  for (const rental of rentals) {
    const application = getEmbeddedApplication(rental);
    const applicationId = String(
      application?.id || rental.application_id || rental.applicationId || "",
    ).trim();

    if (applicationId && application && !isImportedApplicationRecord(application)) {
      embeddedApplicationsById.set(applicationId, application);
    }
  }
  const applicationIds = [
    ...new Set(
      rentals
        .map((rental) => String(rental.application_id || rental.applicationId || ""))
        .filter((applicationId) => applicationId && !embeddedApplicationsById.has(applicationId)),
    ),
  ];
  const applicationsById = new Map([
    ...embeddedApplicationsById,
    ...(await loadApplicationRowsByIds(applicationIds)),
  ]);

  const items = rentals
    .map((rental: any) => {
      const applicationId = String(rental.application_id || rental.applicationId || "");
      const application = applicationsById.get(applicationId);

      if (applicationId && !application) {
        return null;
      }

      const vehicleRegistration = String(
        rental.vehicle_registration ||
          rental.vehicleRegistration ||
          application?.approved_vehicle ||
          application?.approvedVehicle ||
          "",
      ).trim();
      const { applications: _applications, ...rentalWithoutApplications } = rental;

      return {
        ...rentalWithoutApplications,
        application_id: applicationId,
        applicant_name: application?.name || null,
        car_name: vehicleRegistration,
        vehicle_registration: vehicleRegistration,
      };
    })
    .filter((rental): rental is Record<string, any> => Boolean(rental));

  return { applicationsById, items };
};

const loadAdminRentalDatasetWithApplications = async ({
  page,
  pageSize,
  search,
}: {
  page: number;
  pageSize: number;
  search: string;
}) => {
  const searchTerm = normalizeSearchTerm(search);

  if (searchTerm) {
    const [applicationIds, vehicleRentalRows] = await Promise.all([
      fetchMatchingApplicationIds(searchTerm),
      fetchMatchingVehicleRentalRows(searchTerm),
    ]);

    const rentalRowsById = new Map<string, Record<string, any>>();
    if (applicationIds.size > 0) {
      const selectColumns = await getRentalSelectColumns({
        includeStripeFields: true,
      });
      const { data, error } = await applyRentalImportFilters(
        db.from("rentals").select(withRentalApplicationRelation(selectColumns)),
      ).in("application_id", [...applicationIds]);

      if (error) {
        throw error;
      }

      for (const rental of (data || []) as Array<Record<string, any>>) {
        const rentalId = String(rental.id || "").trim();
        if (rentalId) {
          rentalRowsById.set(rentalId, rental);
        }
      }
    }

    for (const rental of vehicleRentalRows) {
      const rentalId = String(rental.id || "").trim();
      if (rentalId) {
        rentalRowsById.set(rentalId, rental);
      }
    }

    const matchedRentalRows = [...rentalRowsById.values()].sort((left, right) => {
      const leftCreated = new Date(String(left.created_at || 0)).getTime();
      const rightCreated = new Date(String(right.created_at || 0)).getTime();
      return rightCreated - leftCreated;
    });
    const { applicationsById, items: formattedRentals } =
      await formatRentalRowsWithApplications(matchedRentalRows);
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
      applicationsById,
    };
  }

  const [orderColumn, selectColumns] = await Promise.all([
    getRentalCreatedAtColumn(),
    getRentalSelectColumns({ includeStripeFields: true }),
  ]);
  const buildRentalQuery = (includeCount: boolean) =>
    applyRentalImportFilters(
      includeCount
        ? db
            .from("rentals")
            .select(withRentalApplicationRelation(selectColumns), { count: "exact" })
        : db.from("rentals").select(withRentalApplicationRelation(selectColumns)),
    );
  const requestedRangeStart = (page - 1) * pageSize;
  const requestedRangeEnd = requestedRangeStart + pageSize - 1;
  const firstResult = await buildRentalQuery(true)
    .order(orderColumn, { ascending: false })
    .range(requestedRangeStart, requestedRangeEnd);
  if (firstResult.error) {
    throw firstResult.error;
  }

  const totalItems = firstResult.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = (currentPage - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;
  let data = firstResult.data;

  if (currentPage !== page && totalItems > 0) {
    const fallbackResult = await buildRentalQuery(false)
      .order(orderColumn, { ascending: false })
      .range(rangeStart, rangeEnd);
    if (fallbackResult.error) {
      throw fallbackResult.error;
    }
    data = fallbackResult.data;
  }

  const { applicationsById, items: formattedRentals } =
    await formatRentalRowsWithApplications((data || []) as Array<Record<string, any>>);

  return {
    items: formattedRentals,
    page: currentPage,
    pageSize,
    total: totalItems,
    totalItems,
    totalPages,
    applicationsById,
  };
};

export const loadAdminRentalDataset = async (params: {
  page: number;
  pageSize: number;
  search: string;
}) => {
  const { applicationsById: _applicationsById, ...dataset } =
    await loadAdminRentalDatasetWithApplications(params);
  return dataset;
};

const quotePostgrestValue = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const buildCustomerLookupExpression = (applications: Array<Record<string, any>>) => {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const names = new Set<string>();

  for (const application of applications) {
    const email = String(application.email || "").trim();
    const phone = String(application.phone || "").trim();
    const name = String(application.name || "").trim();

    if (email) {
      emails.add(email);
    }
    if (phone) {
      phones.add(phone);
    }
    if (name) {
      names.add(name);
    }
  }

  return [
    emails.size > 0
      ? `email.in.(${[...emails].map(quotePostgrestValue).join(",")})`
      : null,
    phones.size > 0
      ? `phone.in.(${[...phones].map(quotePostgrestValue).join(",")})`
      : null,
    names.size > 0
      ? `full_name.in.(${[...names].map(quotePostgrestValue).join(",")})`
      : null,
  ]
    .filter(Boolean)
    .join(",");
};

const loadReferencedCustomers = async (applications: Array<Record<string, any>>) => {
  const expression = buildCustomerLookupExpression(applications);
  if (!expression) {
    return [];
  }

  const { data, error } = await db
    .from("customers")
    .select("id, full_name, phone, email, date_of_birth, street, city, state, postcode")
    .or(expression)
    .limit(150);

  if (error) {
    throw error;
  }

  return (data || []) as Array<Record<string, any>>;
};

export const loadRentalPrefillOptions = async (search: string) => {
  const dataset = await loadAdminRentalDatasetWithApplications({
    page: 1,
    pageSize: 50,
    search,
  });
  const referencedApplications = [...dataset.applicationsById.values()];
  const customerRows = await loadReferencedCustomers(referencedApplications);
  const customerForApplication = (application: Record<string, any> | undefined) => {
    if (!application) {
      return null;
    }

    const email = normalizeExact(application.email);
    const phone = normalizeExact(application.phone);
    const name = normalizeExact(application.name);

    const emailMatch = email
      ? customerRows.find((customer) => normalizeExact(customer.email) === email)
      : null;
    if (emailMatch) {
      return emailMatch;
    }

    const phoneMatch = phone
      ? customerRows.find((customer) => normalizeExact(customer.phone) === phone)
      : null;
    if (phoneMatch) {
      return phoneMatch;
    }

    if (!name) {
      return null;
    }

    return (
      customerRows.find((customer) => {
        const customerEmail = normalizeExact(customer.email);
        const customerPhone = normalizeExact(customer.phone);
        return (
          normalizeExact(customer.full_name) === name &&
          (!email || !customerEmail || customerEmail === email) &&
          (!phone || !customerPhone || customerPhone === phone)
        );
      }) || null
    );
  };

  return dataset.items.map((rental) => {
    const fullName = String(rental.applicant_name || "").trim();
    const application = dataset.applicationsById.get(String(rental.application_id || ""));
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

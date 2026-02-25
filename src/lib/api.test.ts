import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createCheckoutSession } from "./api";
import type { Booking } from "../types";

describe("createCheckoutSession", () => {
  const mockBooking: Partial<Booking> = {
    carId: 1,
    customerName: "John Doe",
    email: "john@example.com",
    phone: "1234567890",
    licenseNumber: "ABC123456",
    startDate: "2023-10-01",
    endDate: "2023-10-07",
  };

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should send the correct POST request", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({ sessionId: "test-session" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await createCheckoutSession(mockBooking);

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mockBooking),
    });
  });

  it("should return data on success", async () => {
    const successData = { sessionId: "test-session" };
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify(successData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const result = await createCheckoutSession(mockBooking);
    expect(result).toEqual(successData);
  });

  it("should throw error with message from response on failure", async () => {
    const errorMsg = "Car already booked";
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({ error: errorMsg }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(createCheckoutSession(mockBooking)).rejects.toThrow(errorMsg);
  });

  it("should throw default error message if none provided by API", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify({}), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(createCheckoutSession(mockBooking)).rejects.toThrow("Failed to create booking");
  });
});

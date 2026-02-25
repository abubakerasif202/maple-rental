import { describe, expect, test } from "vitest";
import { ApplicationSchema } from "./types";

describe("ApplicationSchema", () => {
  const validApplication = {
    name: "John Doe",
    phone: "123-456-7890",
    email: "john.doe@example.com",
    licenseNumber: "DL12345678",
    licenseExpiry: "2025-12-31",
    uberStatus: "Active",
    experience: "5 years",
    address: "123 Main St, Anytown, USA",
    weeklyBudget: "500",
    intendedStartDate: "2024-01-01",
    licensePhoto: "https://example.com/license.jpg",
    uberScreenshot: "https://example.com/uber.jpg",
  };

  test("should validate a correct application object", () => {
    const result = ApplicationSchema.safeParse(validApplication);
    expect(result.success).toBe(true);
  });

  test("should fail if required fields are missing", () => {
    const invalidApplication = { ...validApplication };
    // @ts-ignore
    delete invalidApplication.name;

    const result = ApplicationSchema.safeParse(invalidApplication);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("name");
    }
  });

  test("should validate email format", () => {
    const invalidApplication = { ...validApplication, email: "invalid-email" };
    const result = ApplicationSchema.safeParse(invalidApplication);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("email");
    }
  });

  test("should validate phone length", () => {
     const longPhone = "a".repeat(41);
     const invalidApplication = { ...validApplication, phone: longPhone };
     const result = ApplicationSchema.safeParse(invalidApplication);
     expect(result.success).toBe(false);
     if (!result.success) {
        expect(result.error.issues[0].path).toContain("phone");
     }
  });

    test("should allow optional fields to be null or undefined", () => {
    const applicationWithNulls = {
      ...validApplication,
      licenseExpiry: null,
      experience: null,
      weeklyBudget: null,
      intendedStartDate: null,
      licensePhoto: null,
      uberScreenshot: null,
    };

    const result1 = ApplicationSchema.safeParse(applicationWithNulls);
    expect(result1.success).toBe(true);

    const applicationWithUndefined = {
      ...validApplication,
      licenseExpiry: undefined,
      experience: undefined,
      weeklyBudget: undefined,
      intendedStartDate: undefined,
      licensePhoto: undefined,
      uberScreenshot: undefined,
    };

    const result2 = ApplicationSchema.safeParse(applicationWithUndefined);
    expect(result2.success).toBe(true);
  });

  test("should validate max length for name", () => {
    const longName = "a".repeat(181);
    const invalidApplication = { ...validApplication, name: longName };
    const result = ApplicationSchema.safeParse(invalidApplication);
    expect(result.success).toBe(false);
     if (!result.success) {
        expect(result.error.issues[0].path).toContain("name");
     }
  });

    test("should validate max length for address", () => {
    const longAddress = "a".repeat(301);
    const invalidApplication = { ...validApplication, address: longAddress };
    const result = ApplicationSchema.safeParse(invalidApplication);
    expect(result.success).toBe(false);
     if (!result.success) {
        expect(result.error.issues[0].path).toContain("address");
     }
  });
});

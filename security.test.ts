import { expect, test, describe } from "bun:test";

describe("Security Fix: Hardcoded Notification Email Address", () => {
  test("ADMIN_EMAIL is used in /api/applications", async () => {
    // We want to verify that ADMIN_EMAIL is used.
    // Since ADMIN_EMAIL is defined in api/index.ts and not exported,
    // and it's used inside the route handler which imports Resend dynamically,
    // testing this exactly might be tricky without full integration.

    // However, we can check the source code itself as a form of verification
    const fileContent = await Bun.file("api/index.ts").text();

    // Check if the hardcoded email is gone from the 'to' field in the emails.send call
    // The vulnerable code was:
    // to: 'admin@maplerentals.com.au',

    const hardcodedTo = "to: 'admin@maplerentals.com.au'";
    expect(fileContent).not.toContain(hardcodedTo);

    // Check if it's replaced by ADMIN_EMAIL
    expect(fileContent).toContain("to: ADMIN_EMAIL");
  });
});

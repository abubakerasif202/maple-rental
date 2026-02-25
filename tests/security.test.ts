import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";

const PORT = 3002;
const BASE_URL = `http://localhost:${PORT}`;
let serverProcess;

describe("Security Limits", () => {
  beforeAll(async () => {
    serverProcess = spawn("bun", ["run", "server.ts"], {
      stdio: "pipe",
      env: { ...process.env, PORT: String(PORT), NODE_ENV: "test" }
    });

    // Wait for server
    await new Promise<void>((resolve) => {
      serverProcess.stdout.on("data", (data) => {
        if (data.toString().includes("Server running")) resolve();
      });
      // Also log stderr for debugging
      serverProcess.stderr.on("data", (data) => console.error(data.toString()));
    });
  });

  afterAll(() => {
    if (serverProcess) serverProcess.kill();
  });

  it("should reject large payloads on sensitive endpoints", async () => {
    const largeString = "a".repeat(200 * 1024); // 200KB
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: largeString })
    });
    expect(res.status).toBe(413);
  });

  it("should allow large payloads on application endpoint", async () => {
     const largeString = "a".repeat(5 * 1024 * 1024); // 5MB
     const res = await fetch(`${BASE_URL}/api/applications`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ data: largeString })
     });
     // Expect 400 (validation error) or 200, but NOT 413
     expect(res.status).not.toBe(413);
  });
});

import { expect, test, describe, afterEach, mock } from "bun:test";
import { fetchCars } from "./api";

const originalFetch = global.fetch;

describe("fetchCars", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("throws error when response is not ok", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      } as Response)
    );

    // We expect the promise to reject with an Error
    expect(fetchCars()).rejects.toThrow("Failed to fetch cars");
  });

  test("returns cars when response is ok", async () => {
    const mockCars = [
      { id: 1, name: "Test Car", modelYear: 2022, weeklyPrice: 100, bond: 500, status: "Available", image: "http://example.com/car.jpg" },
    ];

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCars),
      } as Response)
    );

    const cars = await fetchCars();
    expect(cars).toEqual(mockCars);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/cars");
  });
});

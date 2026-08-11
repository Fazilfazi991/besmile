import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attendanceRpcError,
  formatDistance,
  freshLocation,
  geolocationOptions,
  haversineMetres,
  inaccurateLocationError,
  locationBlockedMessage,
  locationError,
  locationUnsupportedMessage,
  officeGeofence,
  outsideGeofenceMessage,
  validLocation,
} from "./attendance-geofence";

const reading = (accuracy: number) => ({
  coords: {
    latitude: officeGeofence.latitude,
    longitude: officeGeofence.longitude,
    accuracy,
  },
});

function browserLocation(
  state: PermissionState,
  positions: Array<{ accuracy: number } | { error: number }>,
) {
  const getCurrentPosition = vi.fn((success, failure, _options?: PositionOptions) => {
    const next = positions.shift();
    if (next && "error" in next) failure({ code: next.error });
    else success(reading(next?.accuracy ?? 10));
  });
  vi.stubGlobal("navigator", {
    permissions: { query: vi.fn().mockResolvedValue({ state }) },
    geolocation: { getCurrentPosition },
  });
  return getCurrentPosition;
}

afterEach(() => vi.unstubAllGlobals());

describe("attendance geofence", () => {
  it("keeps the 100m radius and 50m maximum accuracy", () => {
    expect(officeGeofence.radiusMetres).toBe(100);
    expect(officeGeofence.maxAccuracyMetres).toBe(50);
    expect(validLocation({ latitude: 10, longitude: 76, accuracy: 50 })).toBe(true);
    expect(validLocation({ latitude: 10, longitude: 76, accuracy: 51 })).toBe(false);
  });

  it("formats distances and calculates the office center", () => {
    expect(formatDistance(42)).toBe("42 m");
    expect(formatDistance(2400)).toBe("2.4 km");
    expect(haversineMetres(officeGeofence.latitude, officeGeofence.longitude)).toBe(0);
  });

  it.each(["prompt", "granted"] as PermissionState[])(
    "requests a fresh high-accuracy reading when permission is %s",
    async (state) => {
      const request = browserLocation(state, [{ accuracy: 20 }]);
      await expect(freshLocation("Clock In")).resolves.toMatchObject({ accuracy: 20 });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][2]).toEqual(geolocationOptions);
      expect(geolocationOptions).toMatchObject({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      });
    },
  );

  it("explains an already-blocked site permission without requesting location", async () => {
    const request = browserLocation("denied", []);
    await expect(freshLocation()).rejects.toThrow(locationBlockedMessage);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [1, "Location permission is required to Clock Out"],
    [2, "current location could not be determined"],
    [3, "Location detection took too long"],
  ])("maps geolocation error %s", async (code, message) => {
    browserLocation("granted", [{ error: Number(code) }]);
    await expect(freshLocation("Clock Out")).rejects.toThrow(String(message));
  });

  it("reports unsupported geolocation", async () => {
    vi.stubGlobal("navigator", {});
    await expect(freshLocation()).rejects.toThrow(locationUnsupportedMessage);
  });

  it("retries poor accuracy once and accepts the better fresh reading", async () => {
    const request = browserLocation("granted", [
      { accuracy: 85 },
      { accuracy: 35 },
    ]);
    await expect(freshLocation()).resolves.toMatchObject({ accuracy: 35 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reports actual accuracy after the bounded retry", async () => {
    const request = browserLocation("granted", [
      { accuracy: 88.6 },
      { accuracy: 72.2 },
    ]);
    await expect(freshLocation()).rejects.toThrow(inaccurateLocationError(72.2));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("keeps permission, outside-geofence, and accuracy messages separate", () => {
    expect(locationError({ code: 1 }, "Clock In")).toContain("Clock In");
    expect(attendanceRpcError("You are 250 metres from the office. Attendance is available within 100 metres.")).toBe(outsideGeofenceMessage);
    expect(inaccurateLocationError(75)).not.toBe(outsideGeofenceMessage);
  });
});

export type LocationEvidence = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type AttendanceLocationAction = "Clock In" | "Clock Out";

export const officeGeofence = {
  latitude: 10.0468516,
  longitude: 76.3172664,
  radiusMetres: 100,
  maxAccuracyMetres: 50,
} as const;

export const geolocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

export const locationCheckingMessage =
  "Checking your location… This may take a few seconds.";

export const locationBlockedMessage =
  "Location access is blocked. BSmile needs your location to verify that you are within the office attendance area. Enable Location permission for this site in your browser settings, then try again.";

export const locationUnsupportedMessage =
  "Location services are not supported or available in this browser/device.";

export const outsideGeofenceMessage =
  "You are outside the permitted attendance area. Clock In/Out is allowed only within 100m of the office.";

export function haversineMetres(
  latitude: number,
  longitude: number,
  center = officeGeofence,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const a =
    Math.sin(radians(latitude - center.latitude) / 2) ** 2 +
    Math.cos(radians(center.latitude)) *
      Math.cos(radians(latitude)) *
      Math.sin(radians(longitude - center.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

export function validCoordinates(location: LocationEvidence) {
  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    Number.isFinite(location.accuracy) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    location.accuracy >= 0
  );
}

export function validLocation(location: LocationEvidence) {
  return (
    validCoordinates(location) &&
    location.accuracy <= officeGeofence.maxAccuracyMetres
  );
}

export const inaccurateLocationError = (accuracy: number) =>
  `Your location was detected, but GPS accuracy is currently ±${Math.round(accuracy)}m. Attendance requires accuracy within 50m. Move to an area with a better location signal and try again.`;

export function locationError(
  error: Pick<GeolocationPositionError, "code"> | undefined,
  action: AttendanceLocationAction = "Clock In",
) {
  if (error?.code === 1)
    return `Location permission is required to ${action}. Please allow location access for BSmile and try again.`;
  if (error?.code === 2)
    return "Your current location could not be determined. Please enable device location services and try again.";
  if (error?.code === 3)
    return "Location detection took too long. Move to an area with a better GPS/Wi-Fi signal and try again.";
  return "Your current location could not be determined. Please enable device location services and try again.";
}

export function attendanceRpcError(message: string) {
  if (/You are .*metres from the office|outside the permitted attendance area/i.test(message))
    return outsideGeofenceMessage;
  return message;
}

async function permissionState(): Promise<PermissionState | undefined> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query)
    return undefined;
  try {
    const status = await navigator.permissions.query({
      name: "geolocation",
    } as PermissionDescriptor);
    return status.state;
  } catch {
    return undefined;
  }
}

function currentPosition(): Promise<LocationEvidence> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      reject,
      geolocationOptions,
    );
  });
}

function geolocationFailure(
  error: unknown,
  action: AttendanceLocationAction,
) {
  if (error instanceof Error) return error;
  return new Error(
    locationError(
      error && typeof error === "object" && "code" in error
        ? (error as Pick<GeolocationPositionError, "code">)
        : undefined,
      action,
    ),
  );
}

export async function freshLocation(
  action: AttendanceLocationAction = "Clock In",
): Promise<LocationEvidence> {
  if (typeof navigator === "undefined" || !navigator.geolocation)
    throw new Error(locationUnsupportedMessage);

  if ((await permissionState()) === "denied")
    throw new Error(locationBlockedMessage);

  let first: LocationEvidence;
  try {
    first = await currentPosition();
  } catch (error) {
    throw geolocationFailure(error, action);
  }

  if (!validCoordinates(first))
    throw new Error(
      "Your current location could not be determined. Please enable device location services and try again.",
    );
  if (validLocation(first)) return first;

  let best = first;
  try {
    const second = await currentPosition();
    if (validCoordinates(second) && second.accuracy < best.accuracy) best = second;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code: unknown }).code)
        : undefined;
    if (code === 1) throw geolocationFailure(error, action);
  }

  if (!validLocation(best)) throw new Error(inaccurateLocationError(best.accuracy));
  return best;
}

export function formatDistance(metres: number) {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ApiError extends Error {
  isApiError: true;
}

/** Returns whether a value is a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns an external error's message without trusting its shape. */
export function errorMessage(
  error: unknown,
  fallback = "An unexpected error occurred.",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Returns whether an external error is an API error created by this app. */
export function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof Error && "isApiError" in error && error.isApiError === true
  );
}

/** Creates a UUID using the browser implementation with a legacy fallback. */
export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/** Returns the current time as an ISO-8601 string. */
export function now(): string {
  return new Date().toISOString();
}

/** Reads and validates an array from local storage, returning an empty array on invalid data. */
export function readStorageArray<T>(
  key: string,
  parseItem: (value: unknown) => T | null,
): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(value)
      ? value.flatMap((item) => {
          const parsed = parseItem(item);
          return parsed === null ? [] : [parsed];
        })
      : [];
  } catch {
    return [];
  }
}

/** Reads object records from local storage while rejecting untrusted non-object entries. */
export function readStorageRecords(key: string): Record<string, unknown>[] {
  return readStorageArray(key, (value) => (isRecord(value) ? value : null));
}

/** Writes a JSON-compatible array to local storage. */
export function writeStorageArray<T>(key: string, value: readonly T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Posts an action to an Apps Script endpoint and validates its response envelope. */
export async function requestJson(
  endpoint: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...body }),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const payload: unknown = await response.json();
  if (isRecord(payload) && payload.ok === false) {
    const error = new Error(
      typeof payload.error === "string"
        ? payload.error
        : "The Sheet returned an error.",
    ) as ApiError;
    error.isApiError = true;
    throw error;
  }
  return isRecord(payload) && "data" in payload ? payload.data : payload;
}

export function percentChange(prev: number, next: number) {
  return (next - prev) / prev;
}

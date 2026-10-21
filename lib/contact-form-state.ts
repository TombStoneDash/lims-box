export type ContactFormFields = Record<string, string>;

/**
 * Clears only the fields that still hold the value submitted to the server.
 * A field the visitor edited while the request was in flight (so its current
 * value no longer matches the submitted snapshot) is left untouched.
 */
export function clearSubmittedFields<T extends ContactFormFields>(current: T, submitted: T): T {
  const result = { ...current };
  for (const key of Object.keys(submitted) as Array<keyof T>) {
    if (current[key] === submitted[key]) {
      result[key] = '' as T[keyof T];
    }
  }
  return result;
}

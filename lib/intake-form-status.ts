import { normalizeEmail } from "./emailValidation";

export function intakeValidationMessage(input: {
  email: string;
  labSize: string;
}): string | null {
  if (normalizeEmail(input.email) === null) {
    return "Enter a full email address, for example name@yourlab.org.";
  }
  if (input.labSize.trim().length === 0) {
    return "Choose your lab size.";
  }
  return null;
}

export function intakeErrorMessage(input: {
  status?: number;
  serverError?: unknown;
  thrown?: unknown;
}): string {
  const { serverError } = input;
  if (
    typeof serverError === "string" &&
    serverError.trim().length > 0 &&
    serverError.length < 200 &&
    !/[<>]/.test(serverError)
  ) {
    return serverError;
  }
  return "We could not send your form. Please try again, or email us.";
}

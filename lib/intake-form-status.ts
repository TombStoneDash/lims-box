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

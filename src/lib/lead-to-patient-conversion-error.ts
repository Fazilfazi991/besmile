export const unexpectedLeadConversionMessage =
  "Unable to convert this lead to a client. Please try again or contact an administrator.";

export function leadToPatientConversionError(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String(error.message || "")
          : "";
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code || "")
      : "";
  const message = `${rawMessage} ${code}`;

  if (/already been converted/i.test(message))
    return "This lead has already been converted to a client.";
  if (/already in use|duplicate|23505/i.test(message))
    return "That Client ID is already in use. Choose a different ID.";
  if (/permission|not assigned|42501/i.test(message))
    return "You do not have permission to convert this lead to a client.";
  if (/lead gender/i.test(message))
    return "Please correct the lead's gender to Male or Female, or clear it before converting.";
  if (/patient id is required|22023/i.test(message))
    return "Enter a unique Client ID before converting this lead.";
  return unexpectedLeadConversionMessage;
}

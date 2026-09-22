import { describe, expect, it } from "vitest";
import {
  leadToPatientConversionError,
  unexpectedLeadConversionMessage,
} from "./lead-to-patient-conversion-error";

describe("lead-to-patient conversion errors", () => {
  it("keeps database implementation details out of unexpected feedback", () => {
    const result = leadToPatientConversionError(
      new Error(
        'new row for relation "patients" violates check constraint "patients_gender_check"',
      ),
    );
    expect(result).toBe(unexpectedLeadConversionMessage);
    expect(result).not.toMatch(/patients|constraint|relation|postgres|sql/i);
  });

  it.each([
    [{ message: "duplicate key value", code: "23505" }, "That Client ID is already in use. Choose a different ID."],
    [{ message: "This lead has already been converted to a patient.", code: "23505" }, "This lead has already been converted to a client."],
    [{ message: "permission denied", code: "42501" }, "You do not have permission to convert this lead to a client."],
    [{ message: "Lead gender must be Male or Female, or left blank.", code: "22023" }, "Please correct the lead's gender to Male or Female, or clear it before converting."],
    [{ message: "Patient ID is required.", code: "22023" }, "Enter a unique Client ID before converting this lead."],
  ])("maps an expected RPC error", (message, expected) => {
    expect(leadToPatientConversionError(message)).toBe(expected);
  });
});

export type ClientConversionLink = {
  converted_patient_id?: string | null;
};

export function isConvertedClient(lead: ClientConversionLink) {
  return Boolean(lead.converted_patient_id);
}

// QA/Test identities reviewed in 20260813130000_production_user_cleanup.sql.
// Keep their records for audit history, but exclude them from HR directories.
// Exact IDs avoid hiding real staff based on names or email patterns.
export const reviewedQaProfileIds = [
  'be339aac-6ece-4430-b778-3a21a7f0d2e3',
  '221ab254-d439-4fa1-8403-be1aeb0febc6',
  'f9827e6e-f23c-4234-b318-673045192741',
  'b199d672-efad-4022-8181-b763317a4765',
  'a954ce3b-aa99-47a0-b118-a35fff6b6cbf',
  '8e3eb2cf-5072-4dde-8bb3-e5ab0696614a',
  '339e37df-dd10-465a-820d-8c7ba42df5f8',
  '59ab9a83-9389-44da-821d-996e18b8695b',
  '5e7449bc-96e0-4b67-bb4f-430b7517f852',
  'b0a8e754-15a9-4505-9fae-971661fe24d0',
  '5d26d910-6b3c-41e6-979c-25e723f8a0c0',
  '3192aeac-512c-454f-8270-b5b2c300e194',
  'c0e9df38-2d86-4577-85ca-c946e8281743',
  'b066449b-ec88-44e0-bbcd-b8dd9e2d4942',
] as const;

export const reviewedQaProfileFilter = `(${reviewedQaProfileIds.join(',')})`;

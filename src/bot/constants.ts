/**
 * Different transaction statuses.
 */
export const TRANSACTION_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILURE: "failure",
  PENDING_HASH: "pending_hash",
  FAILURE_503: "failure_503",
  UNDEFINED: "",
} as const;

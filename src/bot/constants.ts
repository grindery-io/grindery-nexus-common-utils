/**
 * Enum representing different transaction statuses.
 */
export const enum TransactionStatus {
  /**
   * Transaction is pending.
   */
  PENDING = "pending",

  /**
   * Transaction was successful.
   */
  SUCCESS = "success",

  /**
   * Transaction encountered a failure.
   */
  FAILURE = "failure",

  /**
   * Transaction is pending due to hash verification.
   */
  PENDING_HASH = "pending_hash",

  /**
   * Transaction failed due to a 503 error.
   */
  FAILURE_503 = "failure_503",

  /**
   * Undefined transaction status.
   */
  UNDEFINED = "",

  /**
   * Transaction is waiting for confirmation.
  */
  WAITING_CONFIRMATION = "waiting_confirmation",

  /**
   * Transaction is waiting for confirmation.
  */
  CANCELLED = "cancelled",
}

/**
 * Enum representing various statuses for GX orders.
 */
export const enum GxOrderStatus {
  /**
   * Order is pending.
   */
  PENDING = "pending",

  /**
   * Order is complete.
   */
  COMPLETE = "complete",

  /**
   * Order failed due to G1 issue.
   */
  FAILURE_G1 = "failure_G1",

  /**
   * Order failed due to USD issue.
   */
  FAILURE_USD = "failure_USD",

  /**
   * Waiting for USD in the order.
   */
  WAITING_USD = "waiting_usd",

  /**
   * Order is pending for USD.
   */
  PENDING_USD = "pending_usd",
}

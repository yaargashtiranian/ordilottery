// Retained only as the injectable contract exercised by payment-boundary unit tests.
export type CheckoutConfig = {
  apiUrl: string;
  token: string;
  allowedOrigins: string[];
};

/** Retired bridge configuration stays disabled; the new journey uses growth/server commerce modes. */
export function getCheckoutConfig(): CheckoutConfig | null {
  return null;
}

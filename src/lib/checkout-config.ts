// Retained only as the injectable contract exercised by payment-boundary unit tests.
export type CheckoutConfig = {
  apiUrl: string;
  token: string;
  allowedOrigins: string[];
};

/** No direct payment provider is implemented yet; legacy env values cannot enable collection. */
export function getCheckoutConfig(): CheckoutConfig | null {
  return null;
}

export type CheckoutConfig = {
  apiUrl: string;
  token: string;
  allowedOrigins: string[];
};

/** Missing/unsafe settings disable collection instead of activating a fake checkout. */
export function getCheckoutConfig(): CheckoutConfig | null {
  const apiUrl = process.env.WORDPRESS_API_URL;
  const token = process.env.WORDPRESS_API_TOKEN;
  const origins = process.env.CHECKOUT_ALLOWED_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !apiUrl ||
    !token ||
    !origins?.length ||
    process.env.ENABLE_CHECKOUT !== "true"
  )
    return null;
  try {
    const url = new URL(apiUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const allowedOrigins = origins.map((value) => {
      const origin = new URL(value);
      if (
        origin.protocol !== "https:" ||
        // URL accepts a literal '*' host, but this contract permits exact origins only.
        origin.hostname.includes("*") ||
        origin.username ||
        origin.password ||
        origin.origin !== value
      )
        throw new Error("Invalid checkout origin");
      return origin.origin;
    });
    return { apiUrl: url.href.replace(/\/$/, ""), token, allowedOrigins };
  } catch {
    return null;
  }
}

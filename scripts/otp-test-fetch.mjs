/** Process-local provider stub, used only by the isolated OTP browser suite; never imported by app code. */
if (
  process.env.SUPABASE_URL !== "http://127.0.0.1:3301" ||
  process.env.MELIPAYAMAK_OTP_TOKEN !== "a".repeat(32) ||
  process.env.OTP_HASH_SECRET !== "b".repeat(64)
)
  throw new Error("OTP fixture requires synthetic backend and credentials");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://console.melipayamak.com/")) {
    if (
      url !== `https://console.melipayamak.com/api/send/otp/${"a".repeat(32)}`
    )
      throw new Error("Unexpected OTP fixture URL");
    const body = JSON.parse(String(init?.body));
    return body.to === "09000000999"
      ? Response.json({ code: "", status: "private provider error" })
      : Response.json({ code: "0741437414", status: "" });
  }
  return originalFetch(input, init);
};

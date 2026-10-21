/** Feed provider and booking channel are independent. Never infer Airbnb from a generic booking. */
export function reservationChannel(platform: string, summary: string | null, description: string | null): string {
  if (platform !== "hostex") return platform;
  const text = `${summary ?? ""}\n${description ?? ""}`;
  const channels = [ /\bairbnb\b/i.test(text) ? "airbnb" : null, /\bbooking\.com\b/i.test(text) ? "booking" : null, /\bvrbo\b/i.test(text) ? "vrbo" : null ].filter(Boolean);
  return channels.length === 1 ? channels[0]! : "hostex";
}

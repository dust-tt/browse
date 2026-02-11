export type Browser = "chrome" | "lightpanda";

export function getBrowserFromEnv(): Browser {
  const browser = process.env.BROWSER?.toLowerCase();
  if (browser === "lightpanda") {
    return "lightpanda";
  }
  return "chrome";
}

import { isEnabled, loadFlags } from "@demo/flags";
import { button } from "@demo/ui";

/** The web app's home screen. */
export function home() {
  return `web home ${button("Get started")}`;
}

/** The checkout. The new one is merged and deployed, but only shows where its flag is on. */
export function checkout({ userId, flags = loadFlags() } = {}) {
  if (isEnabled(flags, "new-checkout", { userId })) return `new checkout ${button("Pay in one tap")}`;
  return `checkout ${button("Pay")}`;
}

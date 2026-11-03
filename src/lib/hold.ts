// Hold switch (B17): with SM_ON_HOLD=true, every page shows the hold notice and every API (crons included) returns 503.
// Off by default; the app runs normally unless the env var is set.
export const HOLD_MESSAGE = "This project is on hold. Please contact ADMIN.";

export function onHold() {
  return process.env.SM_ON_HOLD === "true";
}

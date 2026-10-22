// The project is on hold: every page shows the hold notice, every API (crons included) returns 503.
// On by default so a fresh deploy stays on hold. Set SM_ON_HOLD=false to bring the app back.
export const HOLD_MESSAGE = "This project is on hold. Please contact ADMIN.";

export function onHold() {
  return process.env.SM_ON_HOLD !== "false";
}

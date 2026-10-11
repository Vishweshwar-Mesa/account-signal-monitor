import { Resend } from "resend";

// R6 and D12: automated email goes to ARJUN_EMAIL only. Any other recipient throws.
export interface Mailer {
  send(to: string, subject: string, html: string): Promise<{ id: string | null }>;
}

export function arjunEmail() {
  const e = process.env.ARJUN_EMAIL;
  if (!e) throw new Error("ARJUN_EMAIL missing");
  return e;
}

export const resendMailer: Mailer = {
  async send(to, subject, html) {
    if (to.toLowerCase() !== arjunEmail().toLowerCase()) throw new Error("Refusing to email anyone other than ARJUN_EMAIL");
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY missing");
    const from = `Signal Monitor <${process.env.RESEND_FROM || "onboarding@resend.dev"}>`;
    const r = await new Resend(key).emails.send({ from, to, subject, html });
    if (r.error) throw new Error(`Resend: ${r.error.message}`);
    return { id: r.data?.id ?? null };
  },
};

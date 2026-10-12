import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import LoginForm from "./LoginForm";
import { testMode } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await getUser()) redirect("/");
  const company = process.env.COMPANY_NAME || "Keka";
  const test = testMode();
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-[400px] p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[10px] bg-primary text-on-primary font-display font-bold text-xl inline-flex items-center justify-center" aria-hidden="true">S</span>
            <h1 className="font-display font-bold text-lg leading-tight">{company} · Signal Monitor{test && <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wide bg-demo-bg text-demo-text rounded-[6px] px-1.5 py-0.5">Test build</span>}</h1>
          </div>
        </div>
        {test && (
          <div role="note" className="bg-demo-bg text-demo-text rounded-[10px] px-3 py-2 mb-4 text-sm">
            <b>Test build.</b> Any email and any passcode will sign you in as the demo user ({process.env.USER_NAME || "Arjun"}). CRM data is demo data; signals and company facts are real and cited.
          </div>
        )}
        <LoginForm testMode={test} demoEmail={process.env.ARJUN_EMAIL ?? ""} />
        <div className="mt-4 flex justify-center"><ThemeToggle /></div>
      </div>
    </main>
  );
}

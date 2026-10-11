import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await getUser()) redirect("/");
  const company = process.env.COMPANY_NAME || "Keka";
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-[400px] p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[10px] bg-primary text-on-primary font-display font-bold text-xl inline-flex items-center justify-center" aria-hidden="true">S</span>
            <h1 className="font-display font-bold text-lg leading-tight">{company} · Signal Monitor</h1>
          </div>
        </div>
        <LoginForm />
        <div className="mt-4 flex justify-center"><ThemeToggle /></div>
      </div>
    </main>
  );
}

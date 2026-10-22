import { HOLD_MESSAGE } from "@/lib/hold";

export const dynamic = "force-static";

export default function Hold() {
  const company = process.env.COMPANY_NAME || "Keka";
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-[420px] p-6 text-center">
        <span className="w-10 h-10 rounded-[10px] bg-primary text-on-primary font-display font-bold text-xl inline-flex items-center justify-center mb-4" aria-hidden="true">S</span>
        <h1 className="font-display font-bold text-lg leading-tight mb-2">{company} · Signal Monitor</h1>
        <p role="status" className="text-muted">{HOLD_MESSAGE}</p>
      </div>
    </main>
  );
}

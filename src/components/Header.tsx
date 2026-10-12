import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import { fmtIstTime } from "@/lib/time";
import { testMode } from "@/lib/supabase/config";

export default function Header({ company, team, user, email, updatedAt }: { company: string; team: string; user: string; email: string; updatedAt: string | null }) {
  return (
    <header className="flex items-center justify-between gap-3 flex-wrap py-4">
      <Link href="/" className="flex items-center gap-3 no-underline text-text min-w-0">
        <span className="w-10 h-10 rounded-[10px] bg-primary text-on-primary font-display font-bold text-xl inline-flex items-center justify-center shrink-0" aria-hidden="true">S</span>
        <span className="min-w-0">
          <span className="block font-display font-bold text-lg leading-tight">
            {company} · Signal Monitor
            {testMode() && <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wide bg-demo-bg text-demo-text rounded-[6px] px-1.5 py-0.5" title="Test build: any passcode signs in as the demo user">Test build</span>}
          </span>
          <span className="block text-sm text-muted truncate">
            {team} · {user}&apos;s view{updatedAt ? ` · updated ${fmtIstTime(updatedAt)} IST` : ""}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu name={user} team={team} email={email} />
      </div>
    </header>
  );
}

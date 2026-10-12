import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import { fmtIstTime } from "@/lib/time";

export default function Header({ company, team, user, email, updatedAt }: { company: string; team: string; user: string; email: string; updatedAt: string | null }) {
  return (
    <header className="flex items-center justify-between gap-3 flex-wrap py-4">
      <Link href="/" className="flex items-center gap-3 no-underline text-text min-w-0">
        <span className="w-10 h-10 rounded-[10px] bg-primary text-on-primary font-display font-bold text-xl inline-flex items-center justify-center shrink-0" aria-hidden="true">S</span>
        <span className="min-w-0">
          <span className="block font-display font-bold text-lg leading-tight">
            {company} · Signal Monitor
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

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function UserMenu({ name, team, email }: { name: string; team: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);
  async function signOut() {
    try { await supabaseBrowser().auth.signOut(); } finally { window.location.href = "/login"; }
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn text-sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="w-7 h-7 rounded-full bg-primary text-on-primary inline-flex items-center justify-center font-display font-bold" aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{name}</span>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 mt-2 w-64 p-2 z-20 shadow-lg">
          <div className="px-2 py-2 border-b border-border mb-1">
            <div className="font-semibold">{name}</div>
            <div className="text-sm text-muted">{team}</div>
            <div className="text-sm text-muted break-all">{email}</div>
          </div>
          <Link role="menuitem" href="/runs" className="flex items-center min-h-[44px] px-2 rounded-[8px] hover:bg-surface2 no-underline text-text">Run log</Link>
          <Link role="menuitem" href="/" className="flex items-center min-h-[44px] px-2 rounded-[8px] hover:bg-surface2 no-underline text-text">Dashboard</Link>
          <button role="menuitem" type="button" onClick={signOut} className="w-full text-left flex items-center min-h-[44px] px-2 rounded-[8px] hover:bg-surface2">Sign out</button>
        </div>
      )}
    </div>
  );
}

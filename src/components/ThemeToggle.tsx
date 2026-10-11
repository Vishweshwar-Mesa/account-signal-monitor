"use client";
import { useEffect, useState } from "react";

function current(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => setTheme(current()), []);
  const next = theme === "dark" ? "light" : "dark";
  function toggle() {
    const t = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("sm-theme", t);
    } catch {
      /* storage blocked; the choice lasts for this page only */
    }
    setTheme(t);
  }
  // Fixed width so the label swap never shifts the layout.
  return (
    <button type="button" className="btn w-[128px] text-sm" onClick={toggle} aria-label={`Switch to ${next} mode`}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === null ? "Theme" : theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

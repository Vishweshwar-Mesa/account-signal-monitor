import type { Health } from "@/lib/health";

export default function Banners({ h }: { h: Health }) {
  const items: string[] = [];
  if (h.database !== "postgres") items.push("Database not connected. Showing seed data held in memory; edits are not saved between visits.");
  if (h.hubspot !== "connected") items.push("Running on seed data, HubSpot not connected.");
  if (h.lastIngest?.note) items.push(h.lastIngest.note);
  if (!items.length) return null;
  return (
    <div className="space-y-2 mb-3" role="status">
      {items.map((t) => (
        <p key={t} className="bg-demo-bg text-demo-text text-sm rounded-[10px] px-3 py-2">{t}</p>
      ))}
    </div>
  );
}

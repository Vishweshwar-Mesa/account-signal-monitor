import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadDashboard } from "@/lib/dashboard-data";
import Header from "@/components/Header";
import Banners from "@/components/Banners";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  const data = await loadDashboard();
  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-10">
      <Header company={data.config.company} team={data.config.team} user={data.config.user} email={user.email} updatedAt={data.updatedAt} />
      <Banners h={data.health} />
      {data.accounts.length === 0 ? (
        <div className="card p-6 text-muted">No accounts yet. Seed the database or run an ingest from the run log.</div>
      ) : (
        <Dashboard data={data} />
      )}
    </main>
  );
}

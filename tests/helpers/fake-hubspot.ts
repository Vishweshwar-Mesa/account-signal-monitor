// In-memory fake of the HubSpot endpoints the integration uses. TEST ONLY.
import type { Hs } from "@/lib/hubspot/client";
import { HubspotError } from "@/lib/hubspot/client";

interface Obj { id: string; properties: Record<string, string | null> }
export function fakeHubspot(opts: { allowSecondPipeline?: boolean; failAll?: boolean } = {}) {
  let seq = 1000;
  const id = () => String(++seq);
  const state = {
    calls: [] as string[],
    owners: [{ id: "77", email: "arjun@example.com" }],
    groups: [{ name: "companyinformation" }],
    companyProps: [{ name: "name" }],
    dealProps: [{ name: "dealname" }],
    pipelines: [{ id: "default", label: "Sales Pipeline", stages: [{ id: "appt", label: "Appointment Scheduled" }] }] as { id: string; label: string; stages: { id: string; label: string }[] }[],
    objects: { companies: [] as Obj[], deals: [] as Obj[], tasks: [] as Obj[], calls: [] as Obj[], emails: [] as Obj[], meetings: [] as Obj[], notes: [] as Obj[] } as Record<string, Obj[]>,
    assoc: new Map<string, string>(), // "type:id" -> companyId
  };
  const hs: Hs = {
    async req<T>(method: string, path: string, body?: unknown): Promise<T> {
      state.calls.push(`${method} ${path}`);
      if (opts.failAll) throw new HubspotError(500, "internal error", path);
      const b = body as Record<string, unknown>;
      let m: RegExpMatchArray | null;
      if (method === "GET" && path.startsWith("/crm/v3/owners")) return { results: state.owners } as T;
      if (path === "/crm/v3/properties/companies/groups") {
        if (method === "POST") state.groups.push({ name: b.name as string });
        return { results: state.groups } as T;
      }
      if ((m = path.match(/^\/crm\/v3\/properties\/(companies|deals)$/))) {
        const list = m[1] === "companies" ? state.companyProps : state.dealProps;
        if (method === "POST") list.push({ name: b.name as string });
        return { results: list } as T;
      }
      if (path === "/crm/v3/pipelines/deals") {
        if (method === "GET") return { results: state.pipelines } as T;
        if (!opts.allowSecondPipeline) throw new HubspotError(403, "Your plan allows only one deal pipeline", path);
        const p = { id: id(), label: b.label as string, stages: (b.stages as { label: string }[]).map((s) => ({ id: id(), label: s.label })) };
        state.pipelines.push(p);
        return p as T;
      }
      if ((m = path.match(/^\/crm\/v3\/pipelines\/deals\/([^/]+)\/stages$/))) {
        const p = state.pipelines.find((x) => x.id === m![1])!;
        const s = { id: id(), label: b.label as string };
        p.stages.push(s);
        return s as T;
      }
      if ((m = path.match(/^\/crm\/v3\/pipelines\/deals\/([^/]+)$/))) return state.pipelines.find((x) => x.id === m![1]) as T;
      if ((m = path.match(/^\/crm\/v3\/objects\/(\w+)\/search$/))) {
        const filters = ((b.filterGroups as { filters: { propertyName: string; value: string }[] }[])[0]?.filters) ?? [];
        const results = state.objects[m[1]].filter((o) => filters.every((f) => String(o.properties[f.propertyName]) === String(f.value)));
        return { results } as T;
      }
      if ((m = path.match(/^\/crm\/v3\/objects\/(\w+)\/batch\/update$/))) {
        for (const inp of b.inputs as { id: string; properties: Record<string, string> }[]) {
          const o = state.objects[m[1]].find((x) => x.id === inp.id);
          if (o) Object.assign(o.properties, inp.properties);
        }
        return {} as T;
      }
      if ((m = path.match(/^\/crm\/v3\/objects\/(\w+)$/)) && method === "POST") {
        const o = { id: id(), properties: { ...(b.properties as Record<string, string>) } };
        state.objects[m[1]].push(o);
        return o as T;
      }
      if ((m = path.match(/^\/crm\/v3\/objects\/(\w+)\/(\d+)$/)) && method === "PATCH") {
        const o = state.objects[m[1]].find((x) => x.id === m![2])!;
        Object.assign(o.properties, (b.properties as Record<string, string>));
        return o as T;
      }
      if ((m = path.match(/^\/crm\/v4\/objects\/(\w+)\/(\d+)\/associations\/default\/companies\/(\d+)$/))) {
        state.assoc.set(`${m[1]}:${m[2]}`, m[3]);
        return {} as T;
      }
      if ((m = path.match(/^\/crm\/v4\/associations\/(\w+)\/companies\/batch\/read$/))) {
        const results = (b.inputs as { id: string }[])
          .filter((i) => state.assoc.has(`${m![1]}:${i.id}`))
          .map((i) => ({ from: { id: i.id }, to: [{ toObjectId: state.assoc.get(`${m![1]}:${i.id}`) }] }));
        return { results } as T;
      }
      throw new HubspotError(404, "not mocked", `${method} ${path}`);
    },
  };
  return { hs, state };
}

// Minimal HubSpot REST client. The fetch function is injectable so tests can mock the API.

export class HubspotError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`HubSpot ${status} on ${path}: ${body.slice(0, 300)}`);
  }
  get isScope() {
    return this.status === 403 || /scope/i.test(this.body);
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface Hs {
  req<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

export function hubspotClient(token: string, fetchFn: FetchLike = fetch): Hs {
  return {
    async req<T>(method: string, path: string, body?: unknown): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        const res = await fetchFn(`https://api.hubapi.com${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); // backoff on rate limit
          continue;
        }
        const text = await res.text();
        if (!res.ok) throw new HubspotError(res.status, text, path);
        return (text ? JSON.parse(text) : {}) as T;
      }
    },
  };
}

// Scopes this integration uses. Tasks, notes, calls and meetings use the contacts object scopes in HubSpot.
export const SCOPES_NEEDED = [
  "crm.objects.companies.read", "crm.objects.companies.write",
  "crm.objects.deals.read", "crm.objects.deals.write",
  "crm.objects.contacts.read", "crm.objects.contacts.write",
  "crm.objects.owners.read",
  "crm.schemas.companies.write", "crm.schemas.deals.write",
];

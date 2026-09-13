import "server-only";
import type { DomainProvider, DomainStatus } from "./provider";

/**
 * Vercel Domains API. Adds a restaurant's custom domain to the project; Vercel
 * auto-provisions SSL once DNS points correctly. We surface the verification
 * records so the admin page can show DNS instructions.
 * Docs: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project
 */
const BASE = "https://api.vercel.com";

export class VercelDomainProvider implements DomainProvider {
  constructor(
    private readonly token: string,
    private readonly projectId: string,
    private readonly teamId?: string,
  ) {}

  private q(): string {
    return this.teamId ? `?teamId=${this.teamId}` : "";
  }
  private headers(): HeadersInit {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  async addDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${BASE}/v10/projects/${this.projectId}/domains${this.q()}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ name: domain }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, error: body.error?.message ?? `Vercel ${res.status}` };
  }

  async getStatus(domain: string): Promise<DomainStatus | null> {
    const res = await fetch(
      `${BASE}/v9/projects/${this.projectId}/domains/${domain}${this.q()}`,
      { headers: this.headers() },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      verified?: boolean;
      verification?: { type: string; domain: string; value: string }[];
    };
    return { verified: !!body.verified, verification: body.verification ?? [] };
  }

  async removeDomain(domain: string): Promise<void> {
    await fetch(`${BASE}/v9/projects/${this.projectId}/domains/${domain}${this.q()}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }
}

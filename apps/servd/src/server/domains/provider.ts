/** Domain connection provider (Vercel impl). Swappable behind this interface. */
export interface DomainVerificationRecord {
  type: string; // e.g. "TXT", "CNAME", "A"
  domain: string;
  value: string;
}

export interface DomainStatus {
  verified: boolean;
  verification: DomainVerificationRecord[];
}

export interface DomainProvider {
  addDomain(domain: string): Promise<{ ok: boolean; error?: string }>;
  getStatus(domain: string): Promise<DomainStatus | null>;
  removeDomain(domain: string): Promise<void>;
}

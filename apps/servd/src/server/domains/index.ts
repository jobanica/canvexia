import "server-only";
import { VercelDomainProvider } from "./vercel";
import type { DomainProvider } from "./provider";

/** The platform's domain provider, or null if Vercel isn't configured. */
export function getDomainProvider(): DomainProvider | null {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return new VercelDomainProvider(token, projectId, process.env.VERCEL_TEAM_ID);
}

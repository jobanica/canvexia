import { getBuildState } from "@/server/build/queries";
import { readBuildCookie } from "@/server/build/session";
import { BuildWizard } from "@/components/build/BuildWizard";

export const metadata = {
  title: "Create your free restaurant preview · Servd",
  description: "Build your own ordering page in two minutes. No signup, no card.",
};

/**
 * The public DIY builder. No login: if the visitor already has a build cookie we
 * pick their preview back up, otherwise they start fresh.
 */
export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<{ go?: string }>;
}) {
  const { go } = await searchParams;
  const token = await readBuildCookie();
  const initial = token ? await getBuildState(token) : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.servdph.com";

  return (
    <main className="min-h-screen bg-cream">
      <BuildWizard
        initial={initial}
        appUrl={appUrl}
        startAt={go === "activate" || go === "preview" ? go : undefined}
      />
    </main>
  );
}

import { listProspectLeads } from "@/server/prospecting/queries";
import { ProspectingSearch } from "@/components/super-admin/ProspectingSearch";
import { SavedLeads } from "@/components/super-admin/SavedLeads";

export const metadata = { title: "Prospecting · Servd" };

export default async function ProspectingPage() {
  const leads = await listProspectLeads();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Prospecting</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Find restaurants in a city, see them on the map, and pull their public contact
          details (phone, website, email, Facebook) from OpenStreetMap. Save the promising
          ones as leads and work them through your pipeline. “Find contacts” scrapes a venue’s
          own website to fill in a missing email or Facebook page.
        </p>
      </div>

      <ProspectingSearch />

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Saved leads</h2>
        <SavedLeads leads={leads} />
      </div>
    </div>
  );
}

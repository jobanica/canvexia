import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { ClockPinStation } from "@/components/hr/ClockPinStation";

/** Staff-operated PIN clock station. The device must be signed in as staff. */
export default async function ClockStationPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") redirect("/login");
  return (
    <main className="min-h-screen bg-cream">
      <ClockPinStation />
    </main>
  );
}

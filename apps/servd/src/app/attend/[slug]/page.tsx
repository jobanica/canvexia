import { notFound, redirect } from "next/navigation";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getEmployeeSession } from "@/server/hr/employee-auth";
import { EmployeeLogin } from "@/components/hr/EmployeeLogin";

/**
 * Shared workplace attendance QR target: /attend/{slug}. Any employee scans it,
 * signs in with phone + PIN, then clocks in/out with a selfie in their portal.
 */
export default async function AttendPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug }, select: { name: true, displayName: true } }),
  );
  if (!restaurant) notFound();

  // Already signed in → go straight to the portal to clock in/out.
  if (await getEmployeeSession()) redirect("/employee");

  return (
    <div className="min-h-screen bg-cream px-4 py-16">
      <EmployeeLogin slug={slug} restaurantName={restaurant.displayName || restaurant.name} />
    </div>
  );
}

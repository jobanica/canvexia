import { getCurrentUser } from "@/server/tenancy/current-user";
import { customersCsv } from "@/server/customers/customers";

/** Download the customer book as a CSV file (admin/manager only). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  const csv = await customersCsv(user.restaurantId);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

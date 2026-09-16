import { headers } from "next/headers";
import { manifestResponse } from "@/lib/partners/manifest";

/** The field app's manifest. See the portal route next door. */
export const dynamic = "force-dynamic";

export async function GET() {
  return manifestResponse("field", (await headers()).get("host"));
}

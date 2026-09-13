import { redirect } from "next/navigation";

/** The website at /r/[slug] is now the full ordering experience. */
export default async function WebOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/r/${slug}`);
}

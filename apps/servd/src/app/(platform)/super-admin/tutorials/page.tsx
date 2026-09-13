import { getTutorials } from "@/server/tutorials/tutorials";
import { TutorialsEditor } from "@/components/super-admin/TutorialsEditor";

export const dynamic = "force-dynamic";

export default async function SuperAdminTutorialsPage() {
  const data = await getTutorials();
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const publicUrl = root ? `https://tutorials.${root}` : "/tutorials";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Tutorials</h1>
        <p className="text-sm text-plum-ink/50">
          Build the course-style help hub for your customers. Add sections and paste YouTube links.
          It publishes to <span className="font-semibold text-plum-ink/70">{publicUrl.replace(/^https?:\/\//, "")}</span>,
          which you can share with any store owner.
        </p>
      </div>

      <TutorialsEditor initial={data} publicUrl={publicUrl} />
    </div>
  );
}

import Link from "next/link";
import { listScheduledScripts } from "@/server/content/queries";
import { CalendarBoard } from "@/components/super-admin/content/CalendarBoard";

export const metadata = { title: "Calendar · Content Engine · Servd" };

export default async function CalendarPage() {
  const scripts = await listScheduledScripts(14);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/content-engine" className="text-sm text-plum-ink/50">
          ← Content Engine
        </Link>
        <h1 className="font-heading text-2xl font-bold">Calendar</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          The next two weeks of scheduled posts. Drag to reschedule; the colour mix shows your
          jab-to-hook balance at a glance.
        </p>
      </div>

      {scripts.length === 0 ? (
        <div className="rounded-tile border border-dashed border-plum-ink/15 bg-white p-6 text-sm text-plum-ink/50">
          Nothing scheduled yet. Use{" "}
          <Link href="/super-admin/content-engine/batch" className="font-semibold text-brand-primary">
            Batch
          </Link>{" "}
          to generate a week of content onto the calendar.
        </div>
      ) : (
        <CalendarBoard scripts={scripts} days={14} />
      )}
    </div>
  );
}

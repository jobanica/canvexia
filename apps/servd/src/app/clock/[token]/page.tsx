import { ClockTokenButton } from "@/components/hr/ClockTokenButton";

/** Public personal clock page reached by scanning an employee's QR. */
export default async function ClockTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6">
      <ClockTokenButton token={token} />
    </main>
  );
}

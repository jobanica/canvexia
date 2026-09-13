/**
 * Minimal wrapper for the platform route group. Each section provides its own
 * chrome: /admin renders the dashboard shell (sidebar), while login/signup,
 * kitchen, cashier, and super-admin render their own padded containers.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream text-plum-ink print:bg-white">
      {children}
    </div>
  );
}

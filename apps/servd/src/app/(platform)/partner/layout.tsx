/**
 * The partner portal wears CANVEXIA's brand, not Servd's.
 *
 * One class, defined in styles/globals.css, which overrides the five
 * `--brand-*` variables the whole design system already reads. The background
 * and text are restated here because the platform layout above sets Servd's
 * `bg-brand-surface text-brand-ink` as literal colours, and a variable cannot override a
 * hex someone else already wrote.
 *
 * Applies to every route under /partner — login, forgot-password, apply, the
 * dashboard and the brand editor — so there is no page left to forget.
 */
export default function PartnerBrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      {children}
    </div>
  );
}

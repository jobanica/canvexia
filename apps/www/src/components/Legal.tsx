import Link from "next/link";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { Container } from "./ui";
import { CityProvider } from "./city-context";

/**
 * The shell the two legal pages share.
 *
 * CityProvider is here only because Nav and Footer live inside it on the home
 * page; without it the hooks in those components would have no provider. It
 * costs nothing and keeps the two shells identical.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <CityProvider>
      <Nav />
      <main className="py-16 sm:py-24">
        <Container>
          <div className="max-w-readable">
            <Link href="/" className="text-sm text-ink-faint hover:text-ink">
              ← Back to canvexia.com
            </Link>
            <h1 className="mt-6 font-display text-[2rem] font-bold leading-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-3 text-sm text-ink-faint">Last updated {updated}</p>
            <div className="mt-10 space-y-6 text-base leading-relaxed text-ink-soft [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
              {children}
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </CityProvider>
  );
}

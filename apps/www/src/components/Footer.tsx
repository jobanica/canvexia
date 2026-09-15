import Link from "next/link";
import { Container } from "./ui";
import { Wordmark } from "./Brand";
import { SITE, portalIsExternal } from "@/lib/site";

/**
 * Section 12.
 *
 * NO FAKE ADDRESS AND NO SEC NUMBER — the brief's instruction, kept literally.
 * The bracketed line below is a placeholder for the founder to fill in, and it
 * is deliberately visible rather than a comment: an invisible placeholder is a
 * placeholder that ships forever.
 *
 * Social links are omitted for the same reason as in the founder block — the
 * handles were never supplied, and a guessed link is worse than none.
 */
export function Footer() {
  return (
    <footer className="bg-midnight py-14 text-paper">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Wordmark size={26} tone="light" tagline />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-paper/55">
              Software for Philippine local businesses, sold city by city by the people
              who live in them.
            </p>
          </div>

          <nav aria-label="Site" className="text-sm">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-paper/40">
              Site
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a href="#products" className="text-paper/75 hover:text-paper">
                  Products
                </a>
              </li>
              <li>
                <a href="#how" className="text-paper/75 hover:text-paper">
                  How it works
                </a>
              </li>
              <li>
                <a href="#cities" className="text-paper/75 hover:text-paper">
                  Cities &amp; fees
                </a>
              </li>
              <li>
                <a href="#faq" className="text-paper/75 hover:text-paper">
                  FAQ
                </a>
              </li>
              <li>
                {portalIsExternal ? (
                  <a href={SITE.portalUrl} className="text-paper/75 hover:text-paper">
                    Partner login
                  </a>
                ) : (
                  <Link href={SITE.portalUrl} className="text-paper/75 hover:text-paper">
                    Partner login
                  </Link>
                )}
              </li>
            </ul>
          </nav>

          <div className="text-sm">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-paper/40">
              Contact
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a href={`mailto:${SITE.email}`} className="text-paper/75 hover:text-paper">
                  {SITE.email}
                </a>
              </li>
              <li className="text-paper/55">{SITE.city}</li>
              <li>
                <a
                  href={SITE.servdUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-paper/75 hover:text-paper"
                >
                  Restaurants → servdph.net
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-paper/15 pt-6 text-xs text-paper/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.legalName}. [registration details]
          </p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-paper">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-paper">
              Terms
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}

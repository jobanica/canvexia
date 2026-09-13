import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";
import { getTutorials, tutorialEmbed } from "@/server/tutorials/tutorials";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Servd Tutorials — Learn how to run your store",
  description: "Step-by-step video tutorials for setting up and running your restaurant on Servd.",
};

export default async function TutorialsPage() {
  const { intro, sections } = await getTutorials();
  const withVideos = sections.filter((s) => s.videos.length > 0);

  return (
    <main className="min-h-screen bg-cream">
      <header className="border-b border-plum-ink/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Wordmark />
          <span className="text-sm font-semibold text-plum-ink/50">Tutorials</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-heading text-3xl font-extrabold text-plum-ink sm:text-4xl">How to use Servd</h1>
        {intro && <p className="mt-2 max-w-2xl text-plum-ink/60">{intro}</p>}

        {withVideos.length === 0 ? (
          <p className="mt-10 text-plum-ink/50">Tutorials are coming soon. Check back shortly.</p>
        ) : (
          <div className="mt-10 space-y-12">
            {withVideos.map((sec) => (
              <section key={sec.id}>
                {sec.title && (
                  <h2 className="mb-4 font-heading text-xl font-bold text-plum-ink">{sec.title}</h2>
                )}
                <div className="grid gap-6 sm:grid-cols-2">
                  {sec.videos.map((v) => {
                    const embed = tutorialEmbed(v.url);
                    return (
                      <article key={v.id} className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white shadow-sm">
                        <div className="relative w-full bg-plum-ink/5" style={{ aspectRatio: "16 / 9" }}>
                          {embed.kind === "file" ? (
                            <video src={embed.src} controls className="absolute inset-0 h-full w-full" />
                          ) : (
                            <iframe
                              src={embed.src}
                              title={v.title || "Tutorial"}
                              loading="lazy"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="absolute inset-0 h-full w-full"
                            />
                          )}
                        </div>
                        <div className="p-4">
                          {v.title && <h3 className="font-heading font-bold text-plum-ink">{v.title}</h3>}
                          {v.description && <p className="mt-1 text-sm text-plum-ink/60">{v.description}</p>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-plum-ink/10 py-8 text-center text-xs text-plum-ink/40">
        Powered by Servd
      </footer>
    </main>
  );
}

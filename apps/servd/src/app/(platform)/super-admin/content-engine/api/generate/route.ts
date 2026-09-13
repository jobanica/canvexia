import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getOrCreateBrand } from "@/server/content/brand";
import { generateScript } from "@/server/content/claude";
import { DAILY_CAP, generationsToday, logGeneration } from "@/server/content/usage";
import { withinCap } from "@/lib/content/limits";

const inputSchema = z.object({
  type: z.enum(["JAB", "RIGHT_HOOK"]),
  pillarId: z.string().optional(),
  topic: z.string().max(500).optional().default(""),
  platform: z.enum(["reels", "tiktok", "facebook"]),
  lengthSec: z.coerce.number().int().min(10).max(180),
});

/**
 * Generate ONE script. Super-admin only. Loads the brand + chosen pillar, pulls
 * recent titles for de-dup, generates, saves a ContentScript (SCRIPTED), and
 * returns it. Malformed model output is handled in generateScript (retry once →
 * graceful error), so this never 500s on bad AI output.
 */
export async function POST(req: Request) {
  // 1. Auth — deny non-super-admins exactly like the rest of the admin area.
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  // 2. Validate input.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // 3. Brand + pillar.
  const brand = await getOrCreateBrand();
  if (!brand) {
    return NextResponse.json(
      { error: "Content Engine isn't set up yet. Run prisma/manual/add-content-engine.sql." },
      { status: 503 },
    );
  }
  const pillar = d.pillarId ? brand.pillars.find((p) => p.id === d.pillarId) : undefined;
  if (d.pillarId && !pillar) {
    return NextResponse.json({ error: "Unknown pillar." }, { status: 400 });
  }

  // 3b. Daily cap (spend / runaway guard).
  if (!withinCap(await generationsToday(), 1, DAILY_CAP)) {
    return NextResponse.json(
      { error: `Daily generation cap (${DAILY_CAP}) reached. Try again tomorrow.` },
      { status: 429 },
    );
  }

  // 4. Recent titles for de-dup.
  const recent = await systemDb((tx) =>
    tx.contentScript.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { title: true },
    }),
  );

  // 5. Generate.
  const gen = await generateScript({
    systemPrompt: brand.systemPrompt,
    pillarName: pillar?.name ?? (d.type === "JAB" ? "General value" : "General ask"),
    pillarGuidance: pillar?.description ?? "",
    type: d.type,
    topic: d.topic,
    platform: d.platform,
    lengthSec: d.lengthSec,
    recentTitles: recent.map((r) => r.title),
  });
  if (!gen.ok) {
    await logGeneration({
      brandId: brand.id,
      model: gen.model,
      mode: "single",
      inputTokens: gen.usage.inputTokens,
      outputTokens: gen.usage.outputTokens,
      ok: false,
    });
    return NextResponse.json({ error: gen.error }, { status: 502 });
  }

  // 6. Save (SCRIPTED) and return.
  const saved = await systemDb((tx) =>
    tx.contentScript.create({
      data: {
        brandId: brand.id,
        pillarId: pillar?.id ?? null,
        type: d.type,
        platform: d.platform,
        lengthSec: d.lengthSec,
        title: gen.script.title,
        hook: gen.script.hook as Prisma.InputJsonValue,
        body: gen.script.body as Prisma.InputJsonValue,
        cta: gen.script.cta ? (gen.script.cta as Prisma.InputJsonValue) : Prisma.DbNull,
        production: gen.script.production as Prisma.InputJsonValue,
        status: "SCRIPTED",
      },
      select: { id: true },
    }),
  );

  await logGeneration({
    brandId: brand.id,
    model: gen.model,
    mode: "single",
    inputTokens: gen.usage.inputTokens,
    outputTokens: gen.usage.outputTokens,
    scriptId: saved.id,
    ok: true,
  });

  return NextResponse.json({
    id: saved.id,
    type: d.type,
    platform: d.platform,
    lengthSec: d.lengthSec,
    pillar: pillar?.name ?? null,
    script: gen.script,
  });
}

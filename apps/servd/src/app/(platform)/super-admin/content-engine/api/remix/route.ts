import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getOrCreateBrand } from "@/server/content/brand";
import { generateScript } from "@/server/content/claude";
import { DAILY_CAP, generationsToday, logGeneration } from "@/server/content/usage";
import { withinCap, remainingToday } from "@/lib/content/limits";
import { buildRemixTopic } from "@/lib/content/stats";

const VARIATIONS = 3;
const inputSchema = z.object({ scriptId: z.string().min(1) });

/**
 * "Remix a winner": take an existing script and generate 3 fresh variations on
 * the same angle/pillar. Super-admin only. Variations are saved as SCRIPTED
 * (unscheduled) so they can be reviewed and slotted onto the calendar.
 */
export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const brand = await getOrCreateBrand();
  if (!brand) {
    return NextResponse.json(
      { error: "Content Engine isn't set up yet. Run prisma/manual/add-content-engine.sql." },
      { status: 503 },
    );
  }

  const original = await systemDb((tx) =>
    tx.contentScript.findUnique({
      where: { id: parsed.data.scriptId },
      select: { id: true, title: true, type: true, platform: true, lengthSec: true, pillarId: true },
    }),
  );
  if (!original) {
    return NextResponse.json({ error: "Script not found." }, { status: 404 });
  }

  const today = await generationsToday();
  if (!withinCap(today, VARIATIONS, DAILY_CAP)) {
    return NextResponse.json(
      {
        error: `Daily generation cap (${DAILY_CAP}) would be exceeded. ${remainingToday(
          today,
          DAILY_CAP,
        )} generations left today.`,
      },
      { status: 429 },
    );
  }

  const pillar = original.pillarId
    ? brand.pillars.find((p) => p.id === original.pillarId)
    : undefined;

  const recent = await systemDb((tx) =>
    tx.contentScript.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { title: true },
    }),
  );
  const avoid = recent.map((r) => r.title);

  const created: Array<{ id: string; title: string }> = [];
  const errors: string[] = [];

  for (let i = 1; i <= VARIATIONS; i++) {
    const gen = await generateScript({
      systemPrompt: brand.systemPrompt,
      pillarName: pillar?.name ?? (original.type === "JAB" ? "General value" : "General ask"),
      pillarGuidance: pillar?.description ?? "",
      type: original.type,
      topic: buildRemixTopic(original.title, i),
      platform: original.platform,
      lengthSec: original.lengthSec,
      recentTitles: avoid,
      batch: true,
    });

    if (!gen.ok) {
      errors.push(`Variation ${i}: ${gen.error}`);
      await logGeneration({
        brandId: brand.id,
        model: gen.model,
        mode: "batch",
        inputTokens: gen.usage.inputTokens,
        outputTokens: gen.usage.outputTokens,
        ok: false,
      });
      continue;
    }

    const saved = await systemDb((tx) =>
      tx.contentScript.create({
        data: {
          brandId: brand.id,
          pillarId: pillar?.id ?? null,
          type: original.type,
          platform: original.platform,
          lengthSec: original.lengthSec,
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
    avoid.unshift(gen.script.title);
    await logGeneration({
      brandId: brand.id,
      model: gen.model,
      mode: "batch",
      inputTokens: gen.usage.inputTokens,
      outputTokens: gen.usage.outputTokens,
      scriptId: saved.id,
      ok: true,
    });
    created.push({ id: saved.id, title: gen.script.title });
  }

  return NextResponse.json({ created, errors });
}

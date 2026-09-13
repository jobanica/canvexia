import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getOrCreateBrand } from "@/server/content/brand";
import { generateScript } from "@/server/content/claude";
import { DAILY_CAP, generationsToday, logGeneration } from "@/server/content/usage";
import { withinCap, remainingToday } from "@/lib/content/limits";
import { buildBatchPlan } from "@/lib/content/batch";

const inputSchema = z.object({
  count: z.coerce.number().int().min(1).max(20),
  platform: z.enum(["reels", "tiktok", "facebook"]),
  lengthSec: z.coerce.number().int().min(10).max(180),
  jabRatio: z.coerce.number().int().min(1).max(6).optional(),
  cadenceDays: z.coerce.number().int().min(1).max(7).optional(),
  topic: z.string().max(500).optional().default(""),
});

/**
 * Generate a J-J-J-H batch. Super-admin only. Uses the cheaper batch model,
 * round-robins pillars, de-dups within the batch + against recent titles,
 * schedules each post, and saves them (SCRIPTED) onto the calendar. The daily
 * cap covers the whole batch; partial failures are reported, never fatal.
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const brand = await getOrCreateBrand();
  if (!brand) {
    return NextResponse.json(
      { error: "Content Engine isn't set up yet. Run prisma/manual/add-content-engine.sql." },
      { status: 503 },
    );
  }

  const jabPillars = brand.pillars
    .filter((p) => p.kind === "JAB" && p.active)
    .map((p) => ({ id: p.id, name: p.name }));
  const hookPillars = brand.pillars
    .filter((p) => p.kind === "RIGHT_HOOK" && p.active)
    .map((p) => ({ id: p.id, name: p.name }));
  const ratio = d.jabRatio ?? brand.jabRatio;

  // Daily cap covers the whole batch.
  const today = await generationsToday();
  if (!withinCap(today, d.count, DAILY_CAP)) {
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

  const plan = buildBatchPlan({
    totalCount: d.count,
    jabRatio: ratio,
    jabPillars,
    hookPillars,
    cadenceDays: d.cadenceDays,
  });

  // Schedule from tomorrow (local midnight).
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);

  // Seed de-dup with recent titles; grow it as the batch produces new ones.
  const recent = await systemDb((tx) =>
    tx.contentScript.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { title: true },
    }),
  );
  const avoid = recent.map((r) => r.title);

  const created: Array<{
    id: string;
    title: string;
    type: "JAB" | "RIGHT_HOOK";
    pillar: string | null;
    scheduledFor: string;
  }> = [];
  const errors: string[] = [];

  for (const item of plan) {
    const pillar = item.pillarId ? brand.pillars.find((p) => p.id === item.pillarId) : undefined;
    const gen = await generateScript({
      systemPrompt: brand.systemPrompt,
      pillarName: pillar?.name ?? (item.type === "JAB" ? "General value" : "General ask"),
      pillarGuidance: pillar?.description ?? "",
      type: item.type,
      topic: d.topic,
      platform: d.platform,
      lengthSec: d.lengthSec,
      recentTitles: avoid,
      batch: true,
    });

    if (!gen.ok) {
      errors.push(`#${item.index + 1} (${item.type}): ${gen.error}`);
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

    const scheduledFor = new Date(start);
    scheduledFor.setDate(start.getDate() + item.dayOffset);

    const saved = await systemDb((tx) =>
      tx.contentScript.create({
        data: {
          brandId: brand.id,
          pillarId: pillar?.id ?? null,
          type: item.type,
          platform: d.platform,
          lengthSec: d.lengthSec,
          title: gen.script.title,
          hook: gen.script.hook as Prisma.InputJsonValue,
          body: gen.script.body as Prisma.InputJsonValue,
          cta: gen.script.cta ? (gen.script.cta as Prisma.InputJsonValue) : Prisma.DbNull,
          production: gen.script.production as Prisma.InputJsonValue,
          status: "SCRIPTED",
          scheduledFor,
        },
        select: { id: true },
      }),
    );

    avoid.unshift(gen.script.title); // don't repeat within the batch
    await logGeneration({
      brandId: brand.id,
      model: gen.model,
      mode: "batch",
      inputTokens: gen.usage.inputTokens,
      outputTokens: gen.usage.outputTokens,
      scriptId: saved.id,
      ok: true,
    });

    created.push({
      id: saved.id,
      title: gen.script.title,
      type: item.type,
      pillar: pillar?.name ?? null,
      scheduledFor: scheduledFor.toISOString(),
    });
  }

  return NextResponse.json({ created, errors, requested: d.count, jabRatio: ratio });
}

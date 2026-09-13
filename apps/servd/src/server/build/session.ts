import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The build token IS the builder's identity — there is no login. It's minted on
 * the first save, set as an httpOnly cookie, and also handed to the owner as a
 * shareable "come back and finish" URL (/build/{token}).
 *
 * Because it's a capability, every server action resolves the restaurant
 * THROUGH the token and refuses anything that isn't still a preview. A token
 * can never reach a live account: activation clears it.
 */

export const BUILD_COOKIE = "servd_build";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export function newBuildToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function setBuildCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(BUILD_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearBuildCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(BUILD_COOKIE);
}

export async function readBuildCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(BUILD_COOKIE)?.value ?? null;
}

export interface BuildContext {
  restaurantId: string;
  token: string;
  slug: string;
}

/**
 * Resolve a build token to its preview restaurant. Returns null for an unknown
 * token OR for one whose restaurant is no longer a preview — so an activated
 * account can never be edited through the anonymous builder.
 */
export async function resolveBuild(token: string | null): Promise<BuildContext | null> {
  if (!token) return null;
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { buildToken: token, status: "preview" },
        select: { id: true, slug: true },
      }),
    );
    return r ? { restaurantId: r.id, token, slug: r.slug } : null;
  } catch {
    return null; // columns not migrated yet
  }
}

/** The current builder from the cookie (the normal path inside actions). */
export async function currentBuild(): Promise<BuildContext | null> {
  return resolveBuild(await readBuildCookie());
}

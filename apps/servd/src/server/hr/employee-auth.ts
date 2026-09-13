"use server";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Lightweight employee accounts: employees log in with their phone number + a
 * numeric PIN (no email needed). This is separate from staff Supabase Auth — it
 * issues a short-lived HMAC-signed cookie scoped to one employee + restaurant.
 */
const COOKIE = "servd_emp";
const MAX_AGE = 60 * 60 * 12; // 12 hours
const SECRET = process.env.CREDENTIALS_ENCRYPTION_KEY || "servd-dev-employee-secret";

export interface EmployeeSession {
  employeeId: string;
  restaurantId: string;
}

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}
function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}
function makeToken(s: EmployeeSession): string {
  const payload = b64url(JSON.stringify({ ...s, exp: Date.now() + MAX_AGE * 1000 }));
  return `${payload}.${sign(payload)}`;
}
function readToken(token: string): EmployeeSession | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return { employeeId: data.employeeId, restaurantId: data.restaurantId };
  } catch {
    return null;
  }
}

function normalizePhone(p: string): string {
  return p.replace(/[^\d+]/g, "").trim();
}

/** Log an employee in by restaurant slug + phone + PIN. */
export async function loginEmployee(
  slug: string,
  phone: string,
  pin: string,
): Promise<{ ok: boolean; error?: string }> {
  const p = normalizePhone(phone);
  const code = pin.trim();
  if (!p || !code) return { ok: false, error: "Enter your phone number and PIN." };

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug }, select: { id: true } }),
  );
  if (!restaurant) return { ok: false, error: "Workplace not found." };

  let emp;
  try {
    emp = await tenantDb(restaurant.id, (tx) =>
      tx.employee.findFirst({
        // Phone lives in contactJson (normalized to digits on save).
        where: { clockPin: code, status: "active", contactJson: { path: ["phone"], equals: p } },
        select: { id: true },
      }),
    );
  } catch {
    return { ok: false, error: "Sign-in is temporarily unavailable." };
  }
  if (!emp) return { ok: false, error: "Wrong phone number or PIN." };

  const jar = await cookies();
  jar.set(COOKIE, makeToken({ employeeId: emp.id, restaurantId: restaurant.id }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return { ok: true };
}

export async function logoutEmployee(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The current employee session (cookie), validated against a live, active row. */
export async function getEmployeeSession(): Promise<
  (EmployeeSession & { fullName: string }) | null
> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const s = readToken(token);
  if (!s) return null;
  try {
    const emp = await tenantDb(s.restaurantId, (tx) =>
      tx.employee.findFirst({ where: { id: s.employeeId, status: "active" }, select: { fullName: true } }),
    );
    if (!emp) return null;
    return { ...s, fullName: emp.fullName };
  } catch {
    return null;
  }
}

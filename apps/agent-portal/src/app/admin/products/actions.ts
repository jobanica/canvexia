"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireStaff } from "@/server/auth";
import { createProduct, rotateProductSecret, updateProduct, validateProductInput } from "@/server/products";
import { addCommissionRule } from "@/server/rules";
import { parseRuleForm } from "@/lib/rule-form";
import { authFailure, formStrings, type FormState } from "@/lib/form-state";

async function admin() {
  return requireStaff("admin");
}

export async function createProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await admin(); } catch (e) { return authFailure(e); }
  const parsed = validateProductInput(formStrings(fd));
  if (!parsed.ok) return { status: "error", message: parsed.error };
  try {
    const { secret } = await createProduct(staff, parsed.input);
    revalidatePath("/admin/products");
    return { status: "done", message: `${parsed.input.name} created. Its API secret:`, secret };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: "error", message: "A product with that slug already exists." };
    }
    throw e;
  }
}

export async function updateProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await admin(); } catch (e) { return authFailure(e); }
  const f = formStrings(fd);
  const parsed = validateProductInput(f);
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const status = f.status === "inactive" ? "inactive" : "active";
  const { slug: _slug, ...rest } = parsed.input;
  await updateProduct(staff, f.productId, { ...rest, status });
  revalidatePath(`/admin/products/${f.productId}`);
  return { status: "done", message: "Saved." };
}

export async function rotateSecretAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await admin(); } catch (e) { return authFailure(e); }
  const productId = String(fd.get("productId") ?? "");
  const secret = await rotateProductSecret(staff, productId);
  revalidatePath(`/admin/products/${productId}`);
  return {
    status: "done",
    message: "New secret issued. The old one has stopped working — update the product now.",
    secret,
  };
}

export async function addRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let staff;
  try { staff = await admin(); } catch (e) { return authFailure(e); }
  const f = formStrings(fd);
  const parsed = parseRuleForm(f);
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const result = await addCommissionRule(staff, f.productId, parsed.input);
  if (!result.ok) return { status: "error", message: result.error };
  revalidatePath(`/admin/products/${f.productId}`);
  return { status: "done", message: "Rule added. Customers who signed up earlier keep their old rule." };
}

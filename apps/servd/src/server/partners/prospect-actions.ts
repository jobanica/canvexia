"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import {
  LeadInput,
  ProspectInput,
  firstMessage,
  isStage,
} from "@/lib/partners/prospect-input";
import { createProspect, moveProspect, partnerBySlug } from "./prospects";
import { submitLead } from "./lead-form";

export type ProspectState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * The signed-in partner, and the capability the pipeline needs to write.
 *
 * `requireWritablePartner` also refuses an HQ "view as" session, which resolves
 * as an admin seat and would otherwise pass the capability check.
 */
async function actor() {
  return requireWritablePartner("pipeline.write");
}

export async function addProspectAction(
  _prev: ProspectState,
  formData: FormData,
): Promise<ProspectState> {
  const who = await actor();
  if (!who) return { status: "error", message: "Your account can't edit the pipeline." };

  const parsed = ProspectInput.safeParse({
    businessName: formData.get("businessName") ?? "",
    ownerName: formData.get("ownerName") ?? "",
    mobile: formData.get("mobile") ?? "",
    address: formData.get("address") ?? "",
    productId: formData.get("productId") ?? "",
    source: formData.get("source") || "other",
    nextFollowUpAt: formData.get("nextFollowUpAt") ?? "",
    notes: formData.get("notes") ?? "",
    assignedToId: formData.get("assignedToId") ?? "",
  });
  if (!parsed.success) return { status: "error", message: firstMessage(parsed.error) };

  const result = await createProspect(who, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/partner/pipeline");
  revalidatePath("/partner");
  return { status: "done", message: `${parsed.data.businessName} added.` };
}

export async function moveProspectAction(
  _prev: ProspectState,
  formData: FormData,
): Promise<ProspectState> {
  const who = await actor();
  if (!who) return { status: "error", message: "Your account can't edit the pipeline." };

  const id = String(formData.get("prospectId") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  if (!id || !isStage(stage)) return { status: "error", message: "That stage doesn't exist." };

  const result = await moveProspect(who, id, stage, String(formData.get("lostReason") ?? ""));
  if (!result.ok) return { status: "error", message: result.message ?? "Could not move that." };

  revalidatePath("/partner/pipeline");
  revalidatePath("/partner");
  return { status: "done", message: "Moved." };
}

export type LeadState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done" };

/**
 * The public lead form's action.
 *
 * The slug arrives in the form because the page is public and has no session —
 * but it is a LOOKUP KEY, not an identity: `partnerBySlug` decides whose
 * pipeline the row lands in, and `LeadInput` has no `partnerId` field, so a
 * crafted POST cannot name a different partner. An unknown or unapproved slug
 * is refused rather than defaulting anywhere.
 */
export async function submitLeadAction(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const partner = await partnerBySlug(String(formData.get("slug") ?? ""));
  if (!partner) {
    return { status: "error", message: "This form is no longer accepting enquiries." };
  }

  const parsed = LeadInput.safeParse({
    businessName: formData.get("businessName") ?? "",
    ownerName: formData.get("ownerName") ?? "",
    mobile: formData.get("mobile") ?? "",
    address: formData.get("address") ?? "",
    productId: formData.get("productId") ?? "",
    message: formData.get("message") ?? "",
    // Absent when the box is unticked — that is how HTML posts a checkbox, and
    // the schema's default is false, so a missing field can never read as
    // consent.
    smsConsent: formData.get("smsConsent") ?? false,
  });
  if (!parsed.success) return { status: "error", message: firstMessage(parsed.error) };

  const result = await submitLead(partner.id, parsed.data, partner.name);
  if (!result.ok) return { status: "error", message: result.message ?? "Please try again." };

  revalidatePath("/partner/pipeline");
  return { status: "done" };
}

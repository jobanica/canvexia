import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import type { PrescriptionInputValues } from "@/lib/pharmacy/prescription-input";

/**
 * PRESCRIPTIONS ON FILE.
 *
 * The sale already carries `prescriptionRef`, a free-text string. This is the
 * record behind it: who the patient is, who prescribed, under what PRC number
 * and on what date — the four things an inspection asks about and the four a
 * string cannot answer.
 *
 * NOTHING HERE ENFORCES ANYTHING. The statutory gate — only a pharmacist may
 * complete a cart containing an Rx item — lives in `roles.ts` and the sale path,
 * where it already works. This is the record, not a second gate that could
 * disagree with the first.
 */

export interface PrescriptionRow {
  id: string;
  rxNumber: string | null;
  patientName: string;
  doctorName: string;
  doctorPrcNo: string | null;
  dateIssued: Date;
  notes: string | null;
  createdAt: Date;
  customerId: string | null;
  customerName: string | null;
  /** Sales dispensed against it — the whole point of keeping the record. */
  dispensings: number;
}

export async function listPrescriptions(
  pharmacyId: string,
  query?: string,
): Promise<PrescriptionRow[]> {
  const q = query?.trim();
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyPrescription.findMany({
      where: q
        ? {
            OR: [
              { patientName: { contains: q, mode: "insensitive" } },
              { doctorName: { contains: q, mode: "insensitive" } },
              { doctorPrcNo: { contains: q, mode: "insensitive" } },
              { rxNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { dateIssued: "desc" },
      take: 200,
      select: {
        id: true,
        rxNumber: true,
        patientName: true,
        doctorName: true,
        doctorPrcNo: true,
        dateIssued: true,
        notes: true,
        createdAt: true,
        customerId: true,
        customer: { select: { name: true } },
        sales: { select: { id: true } },
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    rxNumber: r.rxNumber,
    patientName: r.patientName,
    doctorName: r.doctorName,
    doctorPrcNo: r.doctorPrcNo,
    dateIssued: r.dateIssued,
    notes: r.notes,
    createdAt: r.createdAt,
    customerId: r.customerId,
    customerName: r.customer?.name ?? null,
    dispensings: r.sales.length,
  }));
}

export async function createPrescription(input: {
  pharmacyId: string;
  values: PrescriptionInputValues;
  actorStaffId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { pharmacyId, values } = input;
  try {
    return await systemDb(async (tx) => {
      if (values.customerId) {
        // A customer id from another pharmacy is a cross-tenant reference —
        // harmless on its own and exactly what makes a later join leak.
        const customer = await tx.pharmacyCustomer.findFirst({
          where: { id: values.customerId, pharmacyId },
          select: { id: true },
        });
        if (!customer) return { ok: false as const, error: "That customer was not found." };
      }

      const created = await tx.pharmacyPrescription.create({
        data: {
          pharmacyId,
          customerId: values.customerId,
          rxNumber: values.rxNumber,
          patientName: values.patientName,
          patientDob: values.patientDob,
          doctorName: values.doctorName,
          doctorPrcNo: values.doctorPrcNo,
          dateIssued: values.dateIssued,
          notes: values.notes,
          actorStaffId: input.actorStaffId,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorType: "merchant",
          actorStaffId: input.actorStaffId,
          action: "pharmacy.prescription_recorded",
          entityType: "pharmacy_prescription",
          entityId: created.id,
          after: {
            patientName: values.patientName,
            doctorName: values.doctorName,
            doctorPrcNo: values.doctorPrcNo,
          } as Prisma.InputJsonValue,
        },
      });
      return { ok: true as const, id: created.id };
    });
  } catch {
    return { ok: false, error: "Couldn't save that prescription. Try again." };
  }
}

/** Customers, for the picker on the prescription form. */
export async function customerOptions(pharmacyId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyCustomer.findMany({
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, phone: true },
    }),
  );
}

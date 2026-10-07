import "server-only";
import type { Prisma } from "@prisma/client";
import { resolveSettings, SETTING_KEYS, type PortalSettings, type SettingKey } from "@/lib/settings";
import { staffDb, type Tx } from "@/server/scoped-db";
import { writeAudit } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";

export async function loadSettings(tx: Tx): Promise<PortalSettings> {
  const rows = await tx.agentSetting.findMany({ select: { key: true, value: true } });
  return resolveSettings(rows).settings;
}

export async function loadSettingsWithIssues(tx: Tx) {
  const rows = await tx.agentSetting.findMany({ select: { key: true, value: true } });
  return resolveSettings(rows);
}

/** Save every setting that changed, each with its own audit row. */
export async function saveSettings(staff: SignedInStaff, next: PortalSettings): Promise<SettingKey[]> {
  return staffDb("admin", async (tx) => {
    const current = await loadSettings(tx);
    const changed = SETTING_KEYS.filter(
      (k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]),
    );
    for (const key of changed) {
      const value = next[key] as Prisma.InputJsonValue;
      await tx.agentSetting.upsert({
        where: { key },
        create: { key, value, updatedBy: staff.email },
        update: { value, updatedBy: staff.email },
      });
      await writeAudit(tx, staffActor(staff), {
        action: "setting.update",
        entity: "agent_setting",
        entityId: key,
        before: { value: current[key] },
        after: { value: next[key] },
      });
    }
    return changed;
  });
}

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMissingSchemaError, migrationHint } from "@/lib/db/migration-hint";

describe("migrationHint", () => {
  // The exact string that came back from creating a storefront.
  const missing = new Error(
    "Invalid `prisma.restaurant.create()` invocation: The column `qrGrandfathered` does not exist in the current database.",
  );

  it("names the file to run", () => {
    expect(migrationHint(missing, "add-qr-grandfather.sql")).toContain(
      "prisma/manual/add-qr-grandfather.sql",
    );
  });

  it("keeps the column name, which is how you tell it's the right file", () => {
    expect(migrationHint(missing, "add-qr-grandfather.sql")).toContain("qrGrandfathered");
  });

  it("leaves an ordinary failure alone", () => {
    const e = new Error("Unique constraint failed on the fields: (`slug`)");
    expect(migrationHint(e, "x.sql", "Couldn't create it.")).toBe("Couldn't create it.");
  });

  it("recognises a missing table too", () => {
    expect(isMissingSchemaError(new Error('relation "feature_subscriptions" does not exist'))).toBe(true);
    expect(isMissingSchemaError(new Error("boom"))).toBe(false);
  });
});

/**
 * The regression this whole file exists for.
 *
 * A plain `@default(...)` on a scalar is applied by Prisma, not Postgres, so
 * Prisma writes the column into the INSERT of EVERY restaurant.create() —
 * including the ones that never mention it. Add a column that way and every
 * database that hasn't run its migration yet can no longer create a restaurant
 * at all. `dbgenerated` hands the default back to the database, so Prisma never
 * names the column and creates keep working through the lag.
 *
 * Columns whose migration is still going out by hand must therefore be
 * dbgenerated. Older ones predate the manual-migration era and are long since
 * applied everywhere.
 */
describe("Restaurant schema defaults", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const restaurantModel = schema.slice(
    schema.indexOf("model Restaurant {"),
    schema.indexOf("@@map(\"restaurants\")"),
  );

  it.each(["qrGrandfathered", "autoPrintReceipt", "openDrawerOn"])(
    "%s takes its default from the database, not from Prisma",
    (field) => {
      const line = restaurantModel
        .split("\n")
        .find((l) => new RegExp(`^\\s*${field}\\s`).test(l));
      expect(line, `${field} missing from the Restaurant model`).toBeDefined();
      expect(line).toContain("dbgenerated(");
    },
  );

  it.each([
    ["add-qr-grandfather.sql", '"qrGrandfathered" BOOLEAN NOT NULL DEFAULT false'],
    ["add-drawer-receipt-settings.sql", '"autoPrintReceipt" BOOLEAN NOT NULL DEFAULT true'],
    ["add-drawer-receipt-settings.sql", `"openDrawerOn" TEXT NOT NULL DEFAULT 'cash'`],
  ])("%s actually supplies the default dbgenerated relies on", (file, clause) => {
    const sql = readFileSync(join(process.cwd(), "prisma/manual", file), "utf8");
    expect(sql).toContain(clause);
  });
});

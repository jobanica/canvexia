"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatPeso, formatDelta } from "@/lib/money";
import {
  unitPrice,
  validateSelection,
  selectionToLineModifiers,
} from "@/lib/cart/pricing";
import type { CartLine, DinerItem, Selection } from "@/lib/cart/types";
import { selectionFromLine } from "@/lib/cart/edit-line";
import { tagInfo } from "@/lib/menu/dietary";
import { VideoPlayer } from "./VideoPlayer";

/** Generates a unique line id without pulling in a uuid dependency. */
function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ItemModal({
  item,
  editing,
  onAdd,
  onClose,
}: {
  item: DinerItem;
  /** An existing cart line being changed, rather than a new one being added. */
  editing?: CartLine | null;
  onAdd: (line: CartLine) => void;
  onClose: () => void;
}) {
  const variants = item.variants ?? [];
  const inStock = (v: { stock?: number | null }) => v.stock == null || v.stock > 0;
  const [variantId, setVariantId] = useState<string>(
    editing?.variantId ?? (variants.find(inStock) ?? variants[0])?.id ?? "",
  );
  const [selection, setSelection] = useState<Selection>(
    editing ? selectionFromLine(editing) : {},
  );
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [note, setNote] = useState(editing?.note ?? "");
  const [showError, setShowError] = useState(false);
  const t = useTranslations("item");

  // The chosen size sets the base price; modifiers add on top of it.
  const chosenVariant = variants.find((v) => v.id === variantId) ?? null;
  const variantOut = !!chosenVariant && !inStock(chosenVariant);
  const effItem = useMemo(
    () => (chosenVariant ? { ...item, price: chosenVariant.price } : item),
    [item, chosenVariant],
  );
  const price = useMemo(() => unitPrice(effItem, selection), [effItem, selection]);
  const error = useMemo(
    () => validateSelection(effItem, selection),
    [effItem, selection],
  );

  /**
   * Tap to select, tap again to clear. A single-select group used to be a
   * one-way street — once you tapped an option you couldn't take it back, which
   * is painful when it was an accidental tap. Now re-tapping clears it, unless
   * the group is required (there it has to keep a choice, so re-tapping is a
   * no-op and the diner just picks a different option).
   */
  function toggle(
    groupId: string,
    modId: string,
    single: boolean,
    max: number,
    required: boolean,
  ) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (single) {
        if (!current.includes(modId)) return { ...prev, [groupId]: [modId] };
        return required ? prev : { ...prev, [groupId]: [] };
      }
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((m) => m !== modId) };
      }
      if (current.length >= max) return prev; // at max — ignore
      return { ...prev, [groupId]: [...current, modId] };
    });
  }

  function handleAdd() {
    if (error || variantOut) {
      setShowError(true);
      return;
    }
    onAdd({
      // Editing keeps the same line id, so the cart replaces the line in place
      // instead of leaving the old one behind next to the new one.
      lineId: editing?.lineId ?? lineId(),
      itemId: item.id,
      name: chosenVariant ? `${item.name} (${chosenVariant.name})` : item.name,
      basePrice: effItem.price,
      unitPrice: price,
      quantity,
      modifiers: selectionToLineModifiers(effItem, selection),
      note: note.trim() || undefined,
      variantId: chosenVariant?.id,
      imageUrl: item.imageUrl,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 sm:rounded-tile">
        <div className="flex items-start justify-between">
          <h2 className="font-heading text-xl font-bold text-brand-ink">
            {item.name}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-plum-ink/40"
          >
            ×
          </button>
        </div>
        {item.description && (
          <p className="mt-1 text-sm text-brand-ink/60">{item.description}</p>
        )}

        {item.dietaryTags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.dietaryTags.map(tagInfo).map((tg) =>
              tg ? (
                <span
                  key={tg.key}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    tg.kind === "allergen" ? "bg-guava/10 text-guava" : "bg-brand-primary/10 text-brand-primary"
                  }`}
                >
                  <span>{tg.emoji}</span>
                  {tg.label}
                </span>
              ) : null,
            )}
          </div>
        )}

        {item.videoUrl && (
          <div className="mt-3">
            <VideoPlayer url={item.videoUrl} poster={item.videoPosterUrl ?? item.imageUrl} />
          </div>
        )}

        {variants.length > 0 && (
          <fieldset className="mt-5">
            <legend className="font-semibold text-brand-ink">
              Size <span className="text-xs font-normal text-plum-ink/50">({t("required")})</span>
            </legend>
            <div className="mt-2 space-y-1">
              {variants.map((v) => {
                const out = !inStock(v);
                return (
                  <label
                    key={v.id}
                    className={`flex items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2 ${
                      out ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="__variant"
                        disabled={out}
                        checked={variantId === v.id}
                        onChange={() => setVariantId(v.id)}
                      />
                      {v.name}
                      {out ? (
                        <span className="text-xs font-semibold text-guava">Sold out</span>
                      ) : v.stock != null ? (
                        <span className="text-xs text-plum-ink/45">{v.stock} left</span>
                      ) : null}
                    </span>
                    <span className="text-sm font-semibold text-brand-ink">{formatPeso(v.price)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {item.groups.map((group) => {
          const single = group.maxSelect === 1;
          const chosen = selection[group.id] ?? [];
          return (
            <fieldset key={group.id} className="mt-5">
              <legend className="font-semibold text-brand-ink">
                {group.name}{" "}
                <span className="text-xs font-normal text-plum-ink/50">
                  ({group.required ? t("required") : t("optional")})
                  {!single && ` · ${t("upTo", { n: group.maxSelect })}`}
                </span>
              </legend>
              <div className="mt-2 space-y-1">
                {group.modifiers.map((mod) => {
                  const isChosen = chosen.includes(mod.id);
                  const out = mod.isAvailable === false;
                  return (
                    <label
                      key={mod.id}
                      className={`flex items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2 ${
                        out ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type={single ? "radio" : "checkbox"}
                          name={group.id}
                          checked={isChosen}
                          disabled={out}
                          // A radio never fires onChange when it's ALREADY the
                          // selected one, so the toggle has to hang off click —
                          // that's what lets a diner undo an accidental tap.
                          onClick={() =>
                            toggle(group.id, mod.id, single, group.maxSelect, group.required)
                          }
                          onChange={() => {}}
                        />
                        {mod.name}
                        {out && <span className="text-xs font-semibold text-guava">Sold out</span>}
                      </span>
                      {mod.priceDelta !== 0 && (
                        <span className="text-sm text-brand-primary">
                          {formatDelta(mod.priceDelta)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-brand-ink">
            {t("specialRequest")}
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("specialRequestPlaceholder")}
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </label>

        {showError && error && (
          <p className="mt-3 text-sm text-guava">{error}</p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-plum-ink/15">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-2 text-lg"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="px-3 py-2 text-lg"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={!!error || variantOut}
            className="flex-1 rounded-full py-3 font-semibold btn-brand disabled:opacity-50"
          >
            {variantOut
              ? "Sold out"
              : `${editing ? "Update" : t("add")} · ${formatPeso(price * quantity)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

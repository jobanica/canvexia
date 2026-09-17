"use client";

import { useState } from "react";
import { contrast, darkenToContrast } from "@servd/core";

/**
 * A colour, chosen or pasted.
 *
 * TWO CONTROLS, ONE VALUE, and both are needed. `<input type="color">` is how
 * somebody picks a colour when they are choosing one; it also cannot hold
 * anything but a full six-digit hex, so it cannot accept the "#f80" or the
 * "rgb(…)" a designer pastes, and it shows black for an empty value — which
 * reads as "your brand colour is black" rather than "not set".
 *
 * So the text box is the field of record and the swatch drives it. An empty
 * value keeps the swatch on a neutral grey rather than claiming a colour
 * nobody chose.
 *
 * `checkContrast` adds a live readout, used on the primary colour. The portal
 * paints that colour as text on white and as a solid under white text, and
 * darkens it to 4.5:1 when it is too light to read. A colour that quietly comes
 * out different from the one in the picker is a bug report; a line saying so
 * before you save is a decision.
 */
export function ColourField({
  name,
  initial,
  placeholder,
  checkContrast = false,
}: {
  name: string;
  initial: string;
  placeholder: string;
  /** Show the live contrast readout. On for the primary colour. */
  checkContrast?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const full = /^#[0-9a-fA-F]{6}$/.test(value.trim());

  const onWhite = checkContrast && value.trim() ? contrast(value.trim(), "#FFFFFF") : null;
  const adjusted = onWhite && !onWhite.passesAA ? darkenToContrast(value.trim()) : null;

  return (
    <>
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${name} swatch`}
        value={full ? value.trim() : "#cccccc"}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-brand-ink/15 bg-white p-1"
      />
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
      />
    </div>

    {onWhite && (
      <p className="mt-1.5 flex items-center gap-2 text-xs text-brand-ink/50">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ background: adjusted ?? value.trim() }}
        />
        {adjusted ? (
          <span>
            {onWhite.ratio}:1 on white — too light to read, so your dashboard will use{" "}
            <strong className="font-semibold">{adjusted}</strong>, the same colour a shade
            deeper.
          </span>
        ) : (
          <span>{onWhite.ratio}:1 on white — reads clearly.</span>
        )}
      </p>
    )}
    </>
  );
}

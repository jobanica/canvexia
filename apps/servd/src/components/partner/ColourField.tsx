"use client";

import { useState } from "react";

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
 */
export function ColourField({
  name,
  initial,
  placeholder,
}: {
  name: string;
  initial: string;
  placeholder: string;
}) {
  const [value, setValue] = useState(initial);
  const full = /^#[0-9a-fA-F]{6}$/.test(value.trim());

  return (
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
  );
}

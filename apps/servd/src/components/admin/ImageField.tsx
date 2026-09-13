"use client";

import { useRef, useState } from "react";
import {
  compressImageFile,
  replaceInputFile,
  HARD_MAX_BYTES,
  HARD_LIMIT_MESSAGE,
} from "@/lib/images/compress";

/**
 * A photo picker that shrinks the image before the form is submitted.
 *
 * Drop-in for a bare `<input type="file">`: it keeps the same `name`, so the
 * surrounding Server Action form is unchanged — it just receives a few hundred
 * kilobytes instead of a raw camera file.
 *
 * That matters because the hosting platform caps a Server Action request body
 * at roughly 4.5 MB, under the 5 MB the app used to accept. An oversized photo
 * was rejected before any of our code ran, so nothing could report it kindly;
 * the page simply crashed. Now the file is small long before it is sent, and on
 * the rare path where compression can't run, the picker says so itself rather
 * than letting the upload fail.
 */
export function ImageField({
  name,
  label = "Photo",
  currentUrl,
  className = "",
}: {
  name: string;
  label?: string;
  /** Existing photo, shown until a new one is chosen. */
  currentUrl?: string | null;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    setStatus(null);
    if (!file) {
      setPreview(currentUrl ?? null);
      return;
    }

    setBusy(true);
    try {
      const res = await compressImageFile(file);

      // Compression didn't run or didn't help, and it's still too big to send.
      if (res.bytes > HARD_MAX_BYTES) {
        setError(HARD_LIMIT_MESSAGE);
        clear();
        return;
      }

      if (res.compressed && inputRef.current) {
        if (!replaceInputFile(inputRef.current, res.file)) {
          // Couldn't swap the file in. The original still goes up, so only
          // stop it when the original is the thing that would fail.
          if (res.originalBytes > HARD_MAX_BYTES) {
            setError(HARD_LIMIT_MESSAGE);
            clear();
            return;
          }
        }
      }

      setPreview(URL.createObjectURL(res.file));
      setStatus(
        res.compressed
          ? `Ready — ${kb(res.originalBytes)} → ${kb(res.bytes)}`
          : `Ready — ${kb(res.bytes)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't read that image.");
      clear();
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(currentUrl ?? null);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {preview && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg border border-plum-ink/10 object-cover"
          />
        )}
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-plum-ink/60">{label}</span>
          <input
            ref={inputRef}
            type="file"
            name={name}
            // HEIC is accepted by the picker so we can give a real explanation
            // instead of the phone silently offering no files at all.
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            onChange={onPick}
            className="mt-1 block w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-plum-ink/5 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-plum-ink/70"
          />
        </label>
      </div>

      {busy && <p className="mt-1 text-xs text-plum-ink/50">Preparing photo…</p>}
      {status && !busy && <p className="mt-1 text-xs text-green-700">{status}</p>}
      {error && <p className="mt-1 text-xs text-guava">{error}</p>}
    </div>
  );
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

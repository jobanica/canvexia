"use client";

import { useEffect } from "react";

/**
 * Fires the printer once the ticket has rendered. Works whether the ticket is
 * shown in its own tab or loaded in a hidden iframe (the print targets whichever
 * window this runs in). In Chrome kiosk-printing mode this prints silently.
 */
export function AutoPrint() {
  useEffect(() => {
    // Close the tab once printing finishes (only works for windows we opened).
    const close = () => {
      setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, 300);
    };
    window.addEventListener("afterprint", close);

    const fire = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      window.print();
    };
    // Wait for layout (and the QR SVG) to be ready, then print.
    const t = setTimeout(fire, 500);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", close);
    };
  }, []);
  return null;
}

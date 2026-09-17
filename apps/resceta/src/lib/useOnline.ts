"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser thinks it has a connection.
 *
 * STARTS TRUE, and is corrected in an effect. `navigator.onLine` does not exist
 * on the server, and guessing "offline" during the first render would flash an
 * alarming banner at every cashier on every page load.
 *
 * It is the browser's opinion, not a proof: `onLine` false is reliable, `onLine`
 * true only means a network interface exists. So it is used to WARN, never to
 * decide — the server is what refuses a sale, and it refuses it by not
 * answering.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const read = () => setOnline(navigator.onLine);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  return online;
}

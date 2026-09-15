"use client";

import { createContext, useContext, useState } from "react";

/**
 * The city typed in one section, read by the form in another.
 *
 * Section 6's finder has a "Join the [city] waitlist" button and section 11's
 * form has a city field. They are far apart in the page and neither owns the
 * other, so the city lives in a context that wraps both.
 *
 * A client provider around a server-rendered page is fine: `children` is
 * rendered on the server and passed through, so none of the twelve sections
 * becomes a client component by being inside this.
 */
type CityState = {
  city: string;
  setCity: (city: string) => void;
};

const Ctx = createContext<CityState>({ city: "", setCity: () => {} });

export function CityProvider({ children }: { children: React.ReactNode }) {
  const [city, setCity] = useState("");
  return <Ctx.Provider value={{ city, setCity }}>{children}</Ctx.Provider>;
}

export function useCity(): CityState {
  return useContext(Ctx);
}

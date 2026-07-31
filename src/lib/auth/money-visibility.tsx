'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Defaults to false so a component rendered outside the provider hides money
 * rather than leaking it.
 */
const MoneyVisibilityContext = createContext<boolean>(false);

export function MoneyVisibilityProvider({
  canViewMoney,
  children,
}: {
  canViewMoney: boolean;
  children: ReactNode;
}) {
  return (
    <MoneyVisibilityContext.Provider value={canViewMoney}>
      {children}
    </MoneyVisibilityContext.Provider>
  );
}

/**
 * Whether the signed-in user may see monetary figures. Provided once by the admin
 * shell, so shared components such as BookingDetailsModal do not need the flag
 * threaded through every call site.
 *
 * This governs rendering only. Server components must still redact amounts out of
 * the props they send, since hidden props remain readable in the page payload.
 */
export function useCanViewMoney(): boolean {
  return useContext(MoneyVisibilityContext);
}

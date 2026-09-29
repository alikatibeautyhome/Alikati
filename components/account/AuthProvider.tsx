'use client';

import * as React from 'react';
import { getCurrentCustomer, onCustomerChanged, signOutCustomer } from '@/lib/customer-api';
import type { CustomerProfile } from '@/types/database.types';

interface AuthContextValue {
  /** The signed-in customer, or `null` for a guest. */
  customer: CustomerProfile | null;
  /** True until the session has been resolved — components use it to avoid layout shift. */
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * Customer session for the public site. Mounted inside `<CartProvider>` so both the header and
 * the checkout can read it. Being signed in is never required — every consumer must work with
 * `customer === null`.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = React.useState<CustomerProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      setCustomer(await getCurrentCustomer());
    } catch {
      setCustomer(null);
    }
  }, []);

  // Resolve the session once, after mount (never during render — keeps SSR output stable).
  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const next = await getCurrentCustomer();
        if (active) setCustomer(next);
      } catch {
        if (active) setCustomer(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Re-read whenever a customer-api call signs in / out, or another tab changes the session.
  React.useEffect(() => {
    const unsubscribe = onCustomerChanged(() => {
      void refresh();
    });

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'abh_demo_customer_session') void refresh();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const signOut = React.useCallback(async () => {
    await signOutCustomer();
    setCustomer(null);
  }, []);

  const value: AuthContextValue = { customer, loading, refresh, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth() must be used inside <AuthProvider>.');
  return context;
}

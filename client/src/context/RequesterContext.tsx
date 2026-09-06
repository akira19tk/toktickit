// Stores the selected DevRequester in sessionStorage (BR-05: persists until session ends).
import { createContext, useContext, useState, type ReactNode } from "react";
import type { DevRequester } from "../api";

const SESSION_KEY = "toktickit_requester";

interface RequesterContextValue {
  requester: DevRequester | null;
  setRequester: (r: DevRequester) => void;
  clearRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequesterState] = useState<DevRequester | null>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? (JSON.parse(stored) as DevRequester) : null;
    } catch {
      return null;
    }
  });

  function setRequester(r: DevRequester) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(r));
    setRequesterState(r);
  }

  function clearRequester() {
    sessionStorage.removeItem(SESSION_KEY);
    setRequesterState(null);
  }

  return (
    <RequesterContext.Provider value={{ requester, setRequester, clearRequester }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester(): RequesterContextValue {
  const ctx = useContext(RequesterContext);
  if (!ctx) throw new Error("useRequester must be used within RequesterProvider");
  return ctx;
}

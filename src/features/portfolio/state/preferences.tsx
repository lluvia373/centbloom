"use client";
import { useAuth } from "@/hooks/useAuth";
import { scopedKey } from "@/lib/portfolio-storage";
import type { DisplayCurrency } from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { readDisplayCurrency, saveDisplayCurrency } from "../data/preferences";
type Preferences = {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (value: DisplayCurrency) => void;
  preferenceError: string | null;
};
const Context = createContext<Preferences | null>(null);
export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = scopedKey("stock-display-currency", userId);
  const [currency, setCurrency] = useState<DisplayCurrency>("KRW");
  const [error, setError] = useState<string | null>(null);
  const version = useRef({ value: 0 });
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    const current = version.current;
    const token = ++current.value;
    const load = async () => {
      try {
        const local =
          localStorage.getItem(key) ??
          localStorage.getItem("stock-display-currency");
        setCurrency(local === "USD" ? "USD" : "KRW");
        setError(null);
        const remote = await readDisplayCurrency(userId);
        if (token !== version.current.value) return;
        if (remote) setCurrency(remote);
      } catch {
        if (token === version.current.value)
          setError("표시 통화를 불러오지 못했습니다.");
      }
    };
    void load();
    return () => {
      current.value++;
    };
  }, [key, userId]);
  const setDisplayCurrency = useCallback(
    (value: DisplayCurrency) => {
      const token = ++version.current.value;
      try {
        localStorage.setItem(key, value);
        setCurrency(value);
        setError(null);
      } catch {
        setError("표시 통화를 브라우저에 저장하지 못했습니다.");
        return;
      }
      queue.current = queue.current
        .then(async () => {
          if (token !== version.current.value) return;
          await saveDisplayCurrency(userId, value);
        })
        .catch(() => {
          if (token === version.current.value)
            setError("표시 통화 서버 저장에 실패했습니다. 다시 선택해 주세요.");
        });
    },
    [key, userId],
  );
  return (
    <Context.Provider
      value={{
        displayCurrency: currency,
        setDisplayCurrency,
        preferenceError: error,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("PreferencesProvider is required");
  return value;
}

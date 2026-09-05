"use client";
import { useCallback, useEffect, useRef } from "react";
/** Capture in an event handler; check again before publishing an asynchronous UI result. */
export function useOperationScope(scope: string) {
  const version = useRef({ value: 0 });
  useEffect(() => {
    const current = version.current;
    current.value++;
    return () => {
      current.value++;
    };
  }, [scope]);
  return useCallback(() => {
    const token = version.current.value;
    return () => version.current.value === token;
  }, []);
}

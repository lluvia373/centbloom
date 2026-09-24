"use client";
import { useRef, useState } from "react";
import type { PriceAlert, PriceAlertInput, PriceDirection } from "./price-alerts";
import { useOperationScope } from "@/shared/react/use-operation-scope";
import styles from "./PriceAlertEditor.module.css";

export function PriceAlertEditor({ symbol, currency, rules, pending, onSave, onClose, accountScope = "local" }: {
  symbol: string; currency: string; rules: PriceAlert[]; pending: boolean;
  accountScope?: string;
  onSave: (rules: PriceAlertInput[], requestId: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const initial = (direction: PriceDirection) => {
    const rule = rules.find(row => row.direction === direction);
    return { price: rule ? String(rule.threshold) : "", enabled: rule?.enabled ?? false };
  };
  const [fields, setFields] = useState({ below: initial("below"), above: initial("above") });
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const captureScope = useOperationScope(`${accountScope}:${symbol}`);
  const request = useRef<{ payload: string; id: string } | null>(null);
  return <form className={styles.editor} aria-label={`${symbol} 가격 알림 설정`} onSubmit={async event => {
    event.preventDefault();
    if (locked.current || saving || pending) return;
    const next: PriceAlertInput[] = [];
    for (const direction of ["below", "above"] as const) {
      const field = fields[direction], amount = field.price.trim();
      if (!amount && !field.enabled) continue;
      const threshold = Number(amount);
      if (!amount || !Number.isFinite(threshold) || threshold <= 0) { setError("알림을 켤 가격은 0보다 크게 입력해 주세요."); return; }
      // Retain an existing condition's denomination, even if a provider changed it.
      next.push({ direction, threshold, enabled: field.enabled,
        currency: rules.find(rule => rule.direction === direction)?.currency ?? currency });
    }
    const payload = JSON.stringify(next);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    const isCurrent = captureScope();
    locked.current = true;setSaving(true);setError(null);
    try {
      const failure = await onSave(next, request.current.id);
      if (!isCurrent()) return;
      if (failure) setError(failure); else onClose();
    } catch {
      if (isCurrent()) setError("가격 알림을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      locked.current = false;
      if (isCurrent()) setSaving(false);
    }
  }}>
    <div className={styles.heading}><h4>가격 알림</h4><span>앱 안 알림</span></div>
    {(["below", "above"] as const).map(direction => <div className={styles.rule} key={direction}>
      <label className={styles.toggle} htmlFor={`alert-${symbol}-${direction}`}>
        <input id={`alert-${symbol}-${direction}`} type="checkbox" checked={fields[direction].enabled}
          disabled={saving || pending} onChange={event => setFields(old => ({ ...old, [direction]: { ...old[direction], enabled: event.target.checked } }))} />
        이 가격 {direction === "below" ? "이하" : "이상"}
      </label>
      <div className={styles.price}>
        <input type="number" inputMode="decimal" min="0.000001" step="any" aria-label={`${direction === "below" ? "이하" : "이상"} 알림 가격`}
          disabled={saving || pending} value={fields[direction].price} placeholder="가격 입력"
          onChange={event => setFields(old => ({ ...old, [direction]: { ...old[direction], price: event.target.value } }))} />
        <span>{rules.find(rule => rule.direction === direction)?.currency ?? currency}</span>
      </div>
    </div>)}
    <div className={styles.footer}>
      <p>{error ? <span role="alert" className={styles.error}>{error}</span> : "체크한 조건만 알림을 받습니다."}</p>
      <div className={styles.actions}><button className="button-secondary" type="button" disabled={saving} onClick={onClose}>취소</button>
        <button className="button-primary" type="submit" disabled={saving || pending}>{saving ? "저장 중…" : "저장"}</button></div>
    </div>
  </form>;
}

"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { calendarWeeks, clampCalendarDate, formatCalendarInput, parseCalendarInput, shiftCalendarDate, shiftCalendarMonth } from "./date-picker";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function DateField({ label, value, min, max, rangeStart, rangeEnd, picker, onChange }: {
  label: string;
  value: string;
  min: string;
  max: string;
  rangeStart?: string;
  rangeEnd?: string;
  picker?: {
    value: string;
    min: string;
    max: string;
    onSelect: (value: string) => void;
    onDismiss: (restoreFocus: boolean) => void;
  };
  onChange: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const requestedFocus = useRef<string | null>(null);
  const requestedDate = picker?.value;
  const [pickerDate, setPickerDate] = useState(requestedDate);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(requestedDate ?? value);
  const [draft, setDraft] = useState<{ source: string; text: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const isOpen = open || Boolean(picker);
  const calendarMin = picker?.min ?? min;
  const calendarMax = picker?.max ?? max;
  const calendarValue = picker?.value ?? value;
  const dismissPicker = picker?.onDismiss;
  const text = draft?.source === value ? draft.text : formatCalendarInput(value);
  const month = cursor.slice(0, 7);
  const firstYear = Number(calendarMin.slice(0, 4));
  const lastYear = Number(calendarMax.slice(0, 4));

  // Reset only a new external selection request; month navigation stays local.
  if (pickerDate !== requestedDate) {
    setPickerDate(requestedDate);
    if (requestedDate !== undefined) {
      setCursor(requestedDate);
      setOpen(false);
    }
  }

  useEffect(() => {
    if (requestedDate === undefined) { requestedFocus.current = null; return; }
    requestedFocus.current = requestedDate;
    focusDay.current = true;
  }, [requestedDate]);

  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        dismissPicker?.(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [isOpen, dismissPicker]);

  useEffect(() => {
    if (requestedFocus.current !== null && cursor !== requestedFocus.current) return;
    if (isOpen && focusDay.current) {
      calendar.current?.querySelector<HTMLButtonElement>(`button[data-date="${cursor}"]`)?.focus();
      focusDay.current = false;
      requestedFocus.current = null;
    }
  }, [isOpen, cursor, requestedDate]);

  function showCalendar(focus = false) {
    dismissPicker?.(false);
    focusDay.current = focus;
    setCursor(clampCalendarDate(value, min, max));
    setOpen(true);
    if (focus && open && cursor === value) {
      calendar.current?.querySelector<HTMLButtonElement>(`button[data-date="${cursor}"]`)?.focus();
      focusDay.current = false;
    }
  }

  function closeCalendar() {
    setOpen(false);
    if (dismissPicker) dismissPicker(true);
    else input.current?.focus();
  }

  function selectDate(day: string) {
    if (day < calendarMin || day > calendarMax) return;
    setDraft(null);
    setInvalid(false);
    if (picker) { picker.onSelect(day); return; }
    onChange(day);
    closeCalendar();
  }

  function commitInput(raw: string, reportError: boolean) {
    const next = parseCalendarInput(raw);
    if (next && next >= min && next <= max) {
      setInvalid(false);
      onChange(next);
      setCursor(next);
      if (reportError) setDraft(null);
      return true;
    }
    if (reportError) setInvalid(true);
    return false;
  }

  function moveCursor(next: string, focus = false) {
    focusDay.current = focus;
    const day = clampCalendarDate(next, calendarMin, calendarMax);
    setCursor(day);
    if (focus && day === cursor) calendar.current?.querySelector<HTMLButtonElement>(`button[data-date="${day}"]`)?.focus();
  }

  function gridKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    let next: string | null = null;
    if (event.key === "ArrowLeft") next = shiftCalendarDate(day, -1);
    if (event.key === "ArrowRight") next = shiftCalendarDate(day, 1);
    if (event.key === "ArrowUp") next = shiftCalendarDate(day, -7);
    if (event.key === "ArrowDown") next = shiftCalendarDate(day, 7);
    if (event.key === "Home") next = shiftCalendarDate(day, -weekday);
    if (event.key === "End") next = shiftCalendarDate(day, 6 - weekday);
    if (event.key === "PageUp") next = shiftCalendarMonth(day, event.shiftKey ? -12 : -1);
    if (event.key === "PageDown") next = shiftCalendarMonth(day, event.shiftKey ? 12 : 1);
    if (next) { event.preventDefault(); moveCursor(next, true); }
  }

  return (
    <div ref={root} className="performance-date-field" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        if (draft?.source === value) commitInput(text, true);
        setOpen(false);
        dismissPicker?.(false);
      }
    }} onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        setDraft(null); setInvalid(false); closeCalendar();
      }
    }}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <span id={`${id}-format`} className="sr-only">연도.월.일 형식. 아래 방향키로 달력에서 선택</span>
      <input ref={input} id={id} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
        role="combobox" aria-haspopup="dialog" aria-expanded={isOpen} aria-controls={isOpen ? `${id}-calendar` : undefined}
        aria-describedby={`${id}-format${invalid ? ` ${id}-error` : ""}`} aria-invalid={invalid || undefined}
        value={text} onClick={() => showCalendar()} onChange={(event) => {
          dismissPicker?.(false);
          const raw = event.target.value;
          setDraft({ source: value, text: raw }); setInvalid(false);
          if (raw.replace(/\s/g, "").length >= 10 || /^\d{8}$/.test(raw)) commitInput(raw, false);
        }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); showCalendar(true); }
          if (event.key === "Enter") {
            event.preventDefault();
            if (draft?.source === value) { if (commitInput(text, true)) closeCalendar(); }
            else showCalendar(true);
          }
        }} className="performance-input performance-date-input" />
      {invalid && <span id={`${id}-error`} role="alert" className="performance-date-error">{formatCalendarInput(min)}–{formatCalendarInput(max)} 사이의 날짜를 입력해 주세요.</span>}
      {isOpen && <div ref={calendar} id={`${id}-calendar`} role="dialog" aria-label={`${label} 선택`} className="performance-calendar">
        <div className="performance-calendar-heading"><span>{label}</span><button type="button" aria-label="달력 닫기" onClick={closeCalendar}><X aria-hidden="true" /></button></div>
        <div className="performance-calendar-navigation">
          <button type="button" aria-label="이전 달" disabled={month <= calendarMin.slice(0, 7)} onClick={() => moveCursor(shiftCalendarMonth(cursor, -1))}><ChevronLeft aria-hidden="true" /></button>
          <div className="performance-calendar-month" aria-live="polite">
            <select aria-label="연도" value={Number(month.slice(0, 4))} onChange={(event) => moveCursor(`${event.target.value}-${month.slice(5)}-01`)}>
              {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map(year => <option key={year} value={year}>{year}년</option>)}
            </select>
            <select aria-label="월" value={Number(month.slice(5))} onChange={(event) => moveCursor(`${month.slice(0, 4)}-${event.target.value.padStart(2, "0")}-01`)}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map(number => {
                const candidate = `${month.slice(0, 4)}-${String(number).padStart(2, "0")}`;
                return <option key={number} value={number} disabled={candidate < calendarMin.slice(0, 7) || candidate > calendarMax.slice(0, 7)}>{number}월</option>;
              })}
            </select>
          </div>
          <button type="button" aria-label="다음 달" disabled={month >= calendarMax.slice(0, 7)} onClick={() => moveCursor(shiftCalendarMonth(cursor, 1))}><ChevronRight aria-hidden="true" /></button>
        </div>
        <table role="grid" aria-label={`${month.slice(0, 4)}년 ${Number(month.slice(5))}월`} className="performance-calendar-grid">
          <thead><tr>{WEEKDAYS.map(day => <th key={day} scope="col" abbr={`${day}요일`}>{day}</th>)}</tr></thead>
          <tbody>{calendarWeeks(month).map(week => <tr key={week[0]}>{week.map(day => {
            const outside = day.slice(0, 7) !== month;
            const disabled = day < calendarMin || day > calendarMax;
            return <td key={day} aria-selected={day === calendarValue} data-in-range={rangeStart && rangeEnd && day > rangeStart && day < rangeEnd || undefined}>
              <button type="button" data-date={day} data-outside={outside || undefined} disabled={disabled}
                tabIndex={day === cursor ? 0 : -1} aria-label={`${Number(day.slice(0, 4))}년 ${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`}
                onClick={() => selectDate(day)} onKeyDown={(event) => gridKeyDown(event, day)}>{Number(day.slice(8))}</button>
            </td>;
          })}</tr>)}</tbody>
        </table>
      </div>}
    </div>
  );
}

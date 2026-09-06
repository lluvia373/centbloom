"use client";
import { CalculationHelp } from "@/components/CalculationHelp";

export function MetricCard({
  label,
  value,
  description,
  help,
}: {
  label: string;
  value: string;
  description?: string;
  help?: string;
}) {
  return (
    <div className="bg-[#ffffff] px-5 py-4 sm:px-7">
      <div className="text-cf-caption text-cf-muted">{label}{help && <CalculationHelp label={label}>{help}</CalculationHelp>}</div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#202329]">
        {value}
      </p>
      {description && <p className="mt-1 text-cf-caption text-cf-muted">{description}</p>}
    </div>
  );
}

export function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1.5 block text-xs text-[#727680]">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-[#e9eaed] bg-[#ffffff] px-3 text-sm text-[#202329] outline-none focus:border-[#3b8879]"
      />
    </label>
  );
}

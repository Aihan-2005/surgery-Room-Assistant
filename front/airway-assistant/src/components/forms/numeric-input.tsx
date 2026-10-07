"use client";

import type {
  ChangeEvent,
} from "react";

import {
  normalizeDecimalInput,
} from "@/lib/utils/numbers";

interface NumericInputProps {
  id: string;

  value: string;

  onChange: (
    value: string,
  ) => void;

  placeholder?: string;

  unit?: string;

  disabled?: boolean;

  required?: boolean;

  invalid?: boolean;

  ariaDescribedBy?: string;
}

export function NumericInput({
  id,
  value,
  onChange,
  placeholder,
  unit,
  disabled = false,
  required = false,
  invalid = false,
  ariaDescribedBy,
}: NumericInputProps) {
  function handleChange(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const normalized =
      normalizeDecimalInput(
        event.target.value,
      );

    onChange(
      normalized,
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        dir="ltr"
        autoComplete="off"
        value={value}
        disabled={disabled}
        required={required}
        aria-invalid={
          invalid
            ? true
            : undefined
        }
        aria-describedby={
          ariaDescribedBy
        }
        onChange={
          handleChange
        }
        placeholder={
          placeholder
        }
        className={`
          min-h-14
          w-full
          rounded-2xl
          border
          bg-white
          px-4
          pr-4
          pl-14
          text-left
          text-base
          text-slate-900
          shadow-sm
          outline-none
          transition
          placeholder:text-slate-400
          focus:ring-4
          disabled:cursor-not-allowed
          disabled:bg-slate-100
          ${
            invalid
              ? "border-red-400 focus:border-red-500 focus:ring-red-100"
              : "border-slate-200 focus:border-sky-500 focus:ring-sky-100"
          }
        `}
      />

      {unit && (
        <span
          className="
            pointer-events-none
            absolute
            left-4
            top-1/2
            -translate-y-1/2
            text-xs
            font-medium
            text-slate-400
          "
        >
          {unit}
        </span>
      )}
    </div>
  );
}
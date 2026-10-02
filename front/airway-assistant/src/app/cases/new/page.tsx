"use client";

import {
  FormEvent,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  ChevronDown,
  ClipboardPlus,
} from "lucide-react";

import {
  createCase,
} from "@/lib/db/database";

import type {
  NeckMobility,
} from "@/lib/domain/types";

export default function NewCasePage() {
  const router =
    useRouter();

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    caseCode,
    setCaseCode,
  ] = useState("");

  const [
    height,
    setHeight,
  ] = useState("");

  const [
    weight,
    setWeight,
  ] = useState("");

  const [
    neckMobility,
    setNeckMobility,
  ] =
    useState<NeckMobility>(
      "unknown",
    );

  const [
    notes,
    setNotes,
  ] = useState("");

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);

    if (!caseCode.trim()) {
      setError(
        "کد Case را وارد کنید.",
      );

      return;
    }

    try {
      setSubmitting(true);

      const airwayCase =
        await createCase({
          caseCode,

          heightCm: height
            ? Number(height)
            : undefined,

          weightKg: weight
            ? Number(weight)
            : undefined,

          neckMobility,

          notes:
            notes || undefined,
        });

      router.push(
        `/cases/${airwayCase.id}/capture`,
      );
    } catch (error) {
      console.error(error);

      setError(
        "ذخیره اطلاعات انجام نشد. دوباره تلاش کنید.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="
        px-4
        pb-8
        pt-5
      "
    >
      <header>
        <button
          type="button"
          onClick={() =>
            router.back()
          }
          className="
            flex
            size-10
            items-center
            justify-center
            rounded-xl
            border
            border-slate-200
            bg-white
            text-slate-700
          "
        >
          <ArrowLeft
            className="rotate-180"
            size={19}
          />
        </button>

        <div className="mt-5">
          <p
            className="
              text-xs
              font-semibold
              text-sky-700
            "
          >
            مرحله ۱ از ۲
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              text-slate-950
            "
          >
            اطلاعات اولیه
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-7
              text-slate-500
            "
          >
            فعلاً فقط اطلاعاتی را
            دریافت می‌کنیم که برای
            نسخه اولیه مشخص شده‌اند.
          </p>
        </div>
      </header>

      <form
        onSubmit={
          handleSubmit
        }
        className="mt-7 space-y-5"
      >
        <div>
          <label
            htmlFor="caseCode"
            className="
              mb-2
              block
              text-sm
              font-bold
              text-slate-800
            "
          >
            کد Case
          </label>

          <input
            id="caseCode"
            value={caseCode}
            onChange={(event) =>
              setCaseCode(
                event.target.value,
              )
            }
            placeholder="مثلاً OR-2026-001"
            autoComplete="off"
            className="
              min-h-14
              w-full
              rounded-2xl
              border
              border-slate-200
              bg-white
              px-4
              text-sm
              text-slate-900
              shadow-sm
              transition
              placeholder:text-slate-400
              focus:border-sky-500
              focus:ring-4
              focus:ring-sky-100
            "
          />

          <p
            className="
              mt-2
              text-xs
              leading-5
              text-slate-500
            "
          >
            فعلاً نام یا شناسه هویتی
            بیمار وارد نکنید.
          </p>
        </div>

        <div
          className="
            grid
            grid-cols-2
            gap-3
          "
        >
          <div>
            <label
              htmlFor="height"
              className="
                mb-2
                block
                text-sm
                font-bold
                text-slate-800
              "
            >
              قد
            </label>

            <div className="relative">
              <input
                id="height"
                inputMode="decimal"
                type="number"
                min="0"
                step="0.1"
                value={height}
                onChange={(
                  event,
                ) =>
                  setHeight(
                    event.target
                      .value,
                  )
                }
                placeholder="175"
                className="
                  min-h-14
                  w-full
                  rounded-2xl
                  border
                  border-slate-200
                  bg-white
                  px-4
                  pl-12
                  text-sm
                  focus:border-sky-500
                  focus:ring-4
                  focus:ring-sky-100
                "
              />

              <span
                className="
                  absolute
                  left-4
                  top-1/2
                  -translate-y-1/2
                  text-xs
                  text-slate-400
                "
              >
                cm
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="weight"
              className="
                mb-2
                block
                text-sm
                font-bold
                text-slate-800
              "
            >
              وزن
            </label>

            <div className="relative">
              <input
                id="weight"
                inputMode="decimal"
                type="number"
                min="0"
                step="0.1"
                value={weight}
                onChange={(
                  event,
                ) =>
                  setWeight(
                    event.target
                      .value,
                  )
                }
                placeholder="75"
                className="
                  min-h-14
                  w-full
                  rounded-2xl
                  border
                  border-slate-200
                  bg-white
                  px-4
                  pl-12
                  text-sm
                  focus:border-sky-500
                  focus:ring-4
                  focus:ring-sky-100
                "
              />

              <span
                className="
                  absolute
                  left-4
                  top-1/2
                  -translate-y-1/2
                  text-xs
                  text-slate-400
                "
              >
                kg
              </span>
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="neckMobility"
            className="
              mb-2
              block
              text-sm
              font-bold
              text-slate-800
            "
          >
            حرکت گردن
          </label>

          <div className="relative">
            <select
              id="neckMobility"
              value={
                neckMobility
              }
              onChange={(
                event,
              ) =>
                setNeckMobility(
                  event.target
                    .value as NeckMobility,
                )
              }
              className="
                min-h-14
                w-full
                appearance-none
                rounded-2xl
                border
                border-slate-200
                bg-white
                px-4
                pl-12
                text-sm
                text-slate-900
                focus:border-sky-500
                focus:ring-4
                focus:ring-sky-100
              "
            >
              <option value="unknown">
                مشخص نشده
              </option>

              <option value="normal">
                طبیعی
              </option>

              <option value="reduced">
                محدود
              </option>
            </select>

            <ChevronDown
              size={18}
              className="
                pointer-events-none
                absolute
                left-4
                top-1/2
                -translate-y-1/2
                text-slate-400
              "
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="
              mb-2
              block
              text-sm
              font-bold
              text-slate-800
            "
          >
            یادداشت
          </label>

          <textarea
            id="notes"
            rows={4}
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value,
              )
            }
            placeholder="یادداشت اختیاری..."
            className="
              w-full
              resize-none
              rounded-2xl
              border
              border-slate-200
              bg-white
              p-4
              text-sm
              leading-7
              focus:border-sky-500
              focus:ring-4
              focus:ring-sky-100
            "
          />
        </div>

        {error && (
          <div
            className="
              rounded-2xl
              bg-red-50
              p-4
              text-sm
              leading-6
              text-red-700
            "
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={
            submitting
          }
          className="
            flex
            min-h-14
            w-full
            items-center
            justify-center
            gap-2
            rounded-2xl
            bg-sky-700
            px-5
            font-bold
            text-white
            shadow-sm
            transition
            hover:bg-sky-800
            disabled:cursor-not-allowed
            disabled:opacity-60
            active:scale-[0.99]
          "
        >
          <ClipboardPlus
            size={20}
          />

          {submitting
            ? "در حال ذخیره..."
            : "ذخیره و ادامه"}
        </button>
      </form>
    </div>
  );
}
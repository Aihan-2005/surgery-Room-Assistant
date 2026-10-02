"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  ArrowRight,
  ChevronDown,
  ClipboardPlus,
} from "lucide-react";

import {
  NumericInput,
} from "@/components/forms/numeric-input";

import {
  createCase,
} from "@/lib/db/database";

import type {
  NeckMobility,
} from "@/lib/domain/types";

import {
  parseOptionalNumber,
} from "@/lib/utils/numbers";

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

    const trimmedCaseCode =
      caseCode.trim();

    if (!trimmedCaseCode) {
      setError(
        "کد Case را وارد کنید.",
      );

      return;
    }

    const heightCm =
      parseOptionalNumber(
        height,
      );

    const weightKg =
      parseOptionalNumber(
        weight,
      );

    if (
      height &&
      (heightCm === undefined ||
        heightCm <= 0)
    ) {
      setError(
        "مقدار قد معتبر نیست.",
      );

      return;
    }

    if (
      weight &&
      (weightKg === undefined ||
        weightKg <= 0)
    ) {
      setError(
        "مقدار وزن معتبر نیست.",
      );

      return;
    }

    try {
      setSubmitting(true);

      const airwayCase =
        await createCase({
          caseCode:
            trimmedCaseCode,

          heightCm,

          weightKg,

          neckMobility,

          notes:
            notes.trim() ||
            undefined,
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
          aria-label="بازگشت"
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
            transition
            active:scale-95
          "
        >
          <ArrowRight
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
            مشخصات Case
          </h1>

          <p
            className="
              mt-2
              max-w-sm
              text-sm
              leading-7
              text-slate-500
            "
          >
            اطلاعات اولیه را ثبت کنید.
            تصاویر در مرحله بعد گرفته
            خواهند شد.
          </p>
        </div>
      </header>

      <form
        onSubmit={
          handleSubmit
        }
        className="
          mt-7
          space-y-6
        "
      >
        <section
          className="
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-4
          "
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
              disabled={
                submitting
              }
              onChange={(
                event,
              ) =>
                setCaseCode(
                  event.target
                    .value,
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
                text-base
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
                leading-6
                text-slate-500
              "
            >
              فعلاً اطلاعات هویتی
              مستقیم بیمار مانند نام
              و کد ملی وارد نشود.
            </p>
          </div>
        </section>

        <section
          className="
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-4
          "
        >
          <h2
            className="
              text-sm
              font-bold
              text-slate-900
            "
          >
            اطلاعات فیزیکی
          </h2>

          <div
            className="
              mt-4
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
                  font-medium
                  text-slate-700
                "
              >
                قد
              </label>

              <NumericInput
                id="height"
                value={height}
                onChange={
                  setHeight
                }
                placeholder="175"
                unit="cm"
                disabled={
                  submitting
                }
              />
            </div>

            <div>
              <label
                htmlFor="weight"
                className="
                  mb-2
                  block
                  text-sm
                  font-medium
                  text-slate-700
                "
              >
                وزن
              </label>

              <NumericInput
                id="weight"
                value={weight}
                onChange={
                  setWeight
                }
                placeholder="75"
                unit="kg"
                disabled={
                  submitting
                }
              />
            </div>
          </div>

          <p
            className="
              mt-3
              text-xs
              leading-6
              text-slate-500
            "
          >
            امکان ورود عدد با
            صفحه‌کلید فارسی یا انگلیسی
            وجود دارد.
          </p>
        </section>

        <section
          className="
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-4
          "
        >
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
              وضعیت حرکت گردن
            </label>

            <div className="relative">
              <select
                id="neckMobility"
                value={
                  neckMobility
                }
                disabled={
                  submitting
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

          <div className="mt-5">
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
              disabled={
                submitting
              }
              onChange={(
                event,
              ) =>
                setNotes(
                  event.target
                    .value,
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
        </section>

        {error && (
          <div
            role="alert"
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
            : "ذخیره و رفتن به تصویربرداری"}
        </button>
      </form>
    </div>
  );
}
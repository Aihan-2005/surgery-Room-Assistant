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
  ClipboardPlus,
} from "lucide-react";

import {
  NumericInput,
} from "@/components/forms/numeric-input";

import {
  createCase,
} from "@/lib/db/database";

import type {
  BiologicalSex,
  MallampatiClass,
  UpperLipBiteClass,
} from "@/lib/domain/types";

import {
  parseOptionalNumber,
} from "@/lib/utils/numbers";

/* -------------------------------------------------------------------------- */
/*                                Type Parsers                                */
/* -------------------------------------------------------------------------- */

function parseMallampatiClass(
  value: string,
): MallampatiClass {
  switch (value) {
    case "1":
      return 1;

    case "2":
      return 2;

    case "3":
      return 3;

    case "4":
      return 4;

    default:
      return "unknown";
  }
}

function parseUpperLipBiteClass(
  value: string,
): UpperLipBiteClass {
  switch (value) {
    case "1":
      return 1;

    case "2":
      return 2;

    case "3":
      return 3;

    default:
      return "unknown";
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Page                                     */
/* -------------------------------------------------------------------------- */

export default function NewCasePage() {
  const router =
    useRouter();

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  /* ---------------------------------------------------------------------- */
  /* Patient info                                                           */
  /* ---------------------------------------------------------------------- */

  const [
    fullName,
    setFullName,
  ] =
    useState("");

  const [
    age,
    setAge,
  ] =
    useState("");

  const [
    sex,
    setSex,
  ] =
    useState<BiologicalSex>(
      "unknown",
    );

  const [
    height,
    setHeight,
  ] =
    useState("");

  const [
    weight,
    setWeight,
  ] =
    useState("");

  /* ---------------------------------------------------------------------- */
  /* Airway                                                                 */
  /* ---------------------------------------------------------------------- */

  const [
    mallampati,
    setMallampati,
  ] =
    useState("");

  const [
    upperLipBite,
    setUpperLipBite,
  ] =
    useState("");

  const [
    neckRotation,
    setNeckRotation,
  ] =
    useState("");

  /* ---------------------------------------------------------------------- */
  /* Submit                                                                 */
  /* ---------------------------------------------------------------------- */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);

    const normalizedFullName =
      fullName
        .replace(
          /\s+/g,
          " ",
        )
        .trim();

    const ageYears =
      parseOptionalNumber(
        age,
      );

    const heightCm =
      parseOptionalNumber(
        height,
      );

    const weightKg =
      parseOptionalNumber(
        weight,
      );

    const neckRotationDegrees =
      parseOptionalNumber(
        neckRotation,
      );

    /* -------------------------------------------------------------------- */
    /* Validation                                                           */
    /* -------------------------------------------------------------------- */

    if (
      age &&
      (
        ageYears ===
          undefined ||
        ageYears <=
          0 ||
        ageYears >
          120
      )
    ) {
      setError(
        "سن واردشده معتبر نیست.",
      );

      return;
    }

    if (
      height &&
      (
        heightCm ===
          undefined ||
        heightCm <=
          0 ||
        heightCm >
          250
      )
    ) {
      setError(
        "قد واردشده معتبر نیست.",
      );

      return;
    }

    if (
      weight &&
      (
        weightKg ===
          undefined ||
        weightKg <=
          0 ||
        weightKg >
          500
      )
    ) {
      setError(
        "وزن واردشده معتبر نیست.",
      );

      return;
    }

    if (
      neckRotation &&
      (
        neckRotationDegrees ===
          undefined ||
        neckRotationDegrees <
          0 ||
        neckRotationDegrees >
          180
      )
    ) {
      setError(
        "زاویه حرکت گردن باید بین ۰ تا ۱۸۰ درجه باشد.",
      );

      return;
    }

    const mallampatiClass =
      parseMallampatiClass(
        mallampati,
      );

    const upperLipBiteClass =
      parseUpperLipBiteClass(
        upperLipBite,
      );

    /* -------------------------------------------------------------------- */
    /* Create Case                                                          */
    /* -------------------------------------------------------------------- */

    try {
      setSubmitting(
        true,
      );

      const airwayCase =
        await createCase({
          fullName:
            normalizedFullName ||
            undefined,

          clinical: {
            fullName:
              normalizedFullName ||
              undefined,

            ageYears,

            sex,

            heightCm,

            weightKg,

            /*
             * UI فعلی دیگر normal/reduced ندارد.
             * مقدار واقعی‌تر در زاویه ثبت می‌شود.
             */
            neckMobility:
              "unknown",

            neckRotationDegrees,

            mallampatiClass,

            upperLipBiteClass,

            interincisorDistanceMm:
              undefined,

            thyromentalDistanceMm:
              undefined,

            sternomentalDistanceMm:
              undefined,

            hyomentalDistanceMm:
              undefined,

            neckCircumferenceMm:
              undefined,

            retrognathia:
              "unknown",

            prominentUpperIncisors:
              "unknown",

            priorDifficultIntubation:
              "unknown",
          },
        });

      router.push(
        `/cases/${airwayCase.id}/capture`,
      );
    } catch (
      caughtError
    ) {
      console.error(
        caughtError,
      );

      setError(
        "ذخیره اطلاعات بیمار انجام نشد. دوباره تلاش کنید.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Styles                                                                 */
  /* ---------------------------------------------------------------------- */

  const fieldClassName = `
    h-14
    w-full
    rounded-2xl
    border
    border-slate-200
    bg-white
    px-4
    text-base
    text-slate-900
    shadow-sm
    outline-none
    transition
    placeholder:text-slate-400
    focus:border-sky-500
    focus:ring-4
    focus:ring-sky-100
    disabled:cursor-not-allowed
    disabled:bg-slate-100
    disabled:opacity-60
  `;

  const labelClassName = `
    mb-2
    flex
    min-h-6
    items-end
    text-sm
    font-medium
    text-slate-700
  `;

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <div
      className="
        px-4
        pb-10
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
            مرحله ۱
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              text-slate-950
            "
          >
            اطلاعات بیمار
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-7
              text-slate-500
            "
          >
            اطلاعات موردنیاز را وارد
            کنید و سپس وارد مرحله
            تصویربرداری شوید.
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
        {/* -------------------------------------------------------------- */}
        {/* Full Name                                                      */}
        {/* -------------------------------------------------------------- */}

        <div>
          <label
            htmlFor="fullName"
            className={
              labelClassName
            }
          >
            نام و نام خانوادگی
            <span
              className="
                mr-1.5
                text-xs
                font-normal
                text-slate-400
              "
            >
              اختیاری
            </span>
          </label>

          <input
            id="fullName"
            type="text"
            autoComplete="off"
            value={
              fullName
            }
            disabled={
              submitting
            }
            onChange={(
              event,
            ) =>
              setFullName(
                event.target
                  .value,
              )
            }
            placeholder="نام و نام خانوادگی"
            className={
              fieldClassName
            }
          />
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Base information                                               */}
        {/* -------------------------------------------------------------- */}

        <div>
          <h2
            className="
              mb-4
              text-base
              font-bold
              text-slate-900
            "
          >
            اطلاعات پایه
          </h2>

          <div
            className="
              grid
              grid-cols-2
              gap-x-3
              gap-y-4
            "
          >
            {/* Age */}

            <div className="min-w-0">
              <label
                htmlFor="age"
                className={
                  labelClassName
                }
              >
                سن
              </label>

              <NumericInput
                id="age"
                value={age}
                onChange={
                  setAge
                }
                placeholder="35"
                unit="سال"
                disabled={
                  submitting
                }
              />
            </div>

            {/* Sex */}

            <div className="min-w-0">
              <label
                htmlFor="sex"
                className={
                  labelClassName
                }
              >
                جنسیت
              </label>

              <select
                id="sex"
                value={sex}
                disabled={
                  submitting
                }
                onChange={(
                  event,
                ) =>
                  setSex(
                    event.target
                      .value as BiologicalSex,
                  )
                }
                className={
                  fieldClassName
                }
              >
                <option value="unknown">
                  انتخاب کنید
                </option>

                <option value="male">
                  مرد
                </option>

                <option value="female">
                  زن
                </option>
              </select>
            </div>

            {/* Height */}

            <div className="min-w-0">
              <label
                htmlFor="height"
                className={
                  labelClassName
                }
              >
                قد
              </label>

              <NumericInput
                id="height"
                value={
                  height
                }
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

            {/* Weight */}

            <div className="min-w-0">
              <label
                htmlFor="weight"
                className={
                  labelClassName
                }
              >
                وزن
              </label>

              <NumericInput
                id="weight"
                value={
                  weight
                }
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
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Airway                                                        */}
        {/* -------------------------------------------------------------- */}

        <div
          className="
            grid
            grid-cols-2
            gap-x-3
            gap-y-4
          "
        >
          {/* Mallampati */}

          <div className="min-w-0">
            <label
              htmlFor="mallampati"
              className={
                labelClassName
              }
            >
              Mallampati
            </label>

            <select
              id="mallampati"
              value={
                mallampati
              }
              disabled={
                submitting
              }
              onChange={(
                event,
              ) =>
                setMallampati(
                  event.target
                    .value,
                )
              }
              className={
                fieldClassName
              }
            >
              <option value="">
                انتخاب کنید
              </option>

              <option value="1">
                Class I
              </option>

              <option value="2">
                Class II
              </option>

              <option value="3">
                Class III
              </option>

              <option value="4">
                Class IV
              </option>
            </select>
          </div>

          {/* Upper Lip Bite */}

          <div className="min-w-0">
            <label
              htmlFor="upperLipBite"
              className={
                labelClassName
              }
            >
              Upper Lip Bite
            </label>

            <select
              id="upperLipBite"
              value={
                upperLipBite
              }
              disabled={
                submitting
              }
              onChange={(
                event,
              ) =>
                setUpperLipBite(
                  event.target
                    .value,
                )
              }
              className={
                fieldClassName
              }
            >
              <option value="">
                انتخاب کنید
              </option>

              <option value="1">
                Class I
              </option>

              <option value="2">
                Class II
              </option>

              <option value="3">
                Class III
              </option>
            </select>
          </div>

          {/* Neck Rotation */}

          <div
            className="
              col-span-2
              min-w-0
            "
          >
            <label
              htmlFor="neckRotation"
              className={
                labelClassName
              }
            >
              زاویه حرکت / چرخش گردن
            </label>

            <NumericInput
              id="neckRotation"
              value={
                neckRotation
              }
              onChange={
                setNeckRotation
              }
              placeholder="مثلاً 90"
              unit="°"
              disabled={
                submitting
              }
            />

            <p
              className="
                mt-2
                text-xs
                leading-6
                text-slate-400
              "
            >
              مقدار زاویه حرکت گردن را
              بر حسب درجه وارد کنید.
            </p>
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Error                                                          */}
        {/* -------------------------------------------------------------- */}

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

        {/* -------------------------------------------------------------- */}
        {/* Submit                                                         */}
        {/* -------------------------------------------------------------- */}

        <button
          type="submit"
          disabled={
            submitting
          }
          className="
            flex
            h-14
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
            : "ذخیره و ادامه تصویربرداری"}
        </button>
      </form>
    </div>
  );
}


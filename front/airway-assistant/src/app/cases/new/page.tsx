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
  Check,
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
  HeadRotationStatus,
} from "@/lib/domain/types";

import {
  parseOptionalNumber,
} from "@/lib/utils/numbers";

type FormField =
  | "fullName"
  | "age"
  | "sex"
  | "height"
  | "weight"
  | "headRotation";

type FieldErrors =
  Partial<
    Record<
      FormField,
      string
    >
  >;

const FIELD_ORDER:
  FormField[] = [
    "fullName",
    "age",
    "sex",
    "height",
    "weight",
    "headRotation",
  ];

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

  const [
    fieldErrors,
    setFieldErrors,
  ] =
    useState<FieldErrors>(
      {},
    );

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

  const [
    headRotationStatus,
    setHeadRotationStatus,
  ] =
    useState<
      HeadRotationStatus | null
    >(null);

  function clearFieldError(
    field:
      FormField,
  ) {
    setFieldErrors(
      (current) => {
        if (
          !current[field]
        ) {
          return current;
        }

        const next = {
          ...current,
        };

        delete next[
          field
        ];

        return next;
      },
    );

    setError(null);
  }

  function focusFirstError(
    errors:
      FieldErrors,
  ) {
    const firstField =
      FIELD_ORDER.find(
        (field) =>
          Boolean(
            errors[field],
          ),
      );

    if (!firstField) {
      return;
    }

    window.requestAnimationFrame(
      () => {
        const element =
          document.getElementById(
            firstField,
          );

        element?.scrollIntoView({
          behavior:
            "smooth",

          block:
            "center",
        });

        element?.focus();
      },
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);

    const errors:
      FieldErrors = {};

    const normalizedFullName =
      fullName
        .replace(
          /\s+/g,
          " ",
        )
        .trim();

    if (
      !normalizedFullName
    ) {
      errors.fullName =
        "نام و نام خانوادگی بیمار را وارد کنید.";
    }

    const ageYears =
      parseOptionalNumber(
        age,
      );

    if (!age.trim()) {
      errors.age =
        "سن بیمار را وارد کنید.";
    } else if (
      ageYears ===
        undefined ||
      ageYears <= 0 ||
      ageYears > 120
    ) {
      errors.age =
        "سن واردشده معتبر نیست.";
    }

    if (
      sex === "unknown"
    ) {
      errors.sex =
        "جنسیت بیمار را انتخاب کنید.";
    }

    const heightCm =
      parseOptionalNumber(
        height,
      );

    if (
      !height.trim()
    ) {
      errors.height =
        "قد بیمار را وارد کنید.";
    } else if (
      heightCm ===
        undefined ||
      heightCm <= 0 ||
      heightCm > 250
    ) {
      errors.height =
        "قد واردشده معتبر نیست.";
    }

    const weightKg =
      parseOptionalNumber(
        weight,
      );

    if (
      !weight.trim()
    ) {
      errors.weight =
        "وزن بیمار را وارد کنید.";
    } else if (
      weightKg ===
        undefined ||
      weightKg <= 0 ||
      weightKg > 500
    ) {
      errors.weight =
        "وزن واردشده معتبر نیست.";
    }

    if (
      !headRotationStatus
    ) {
      errors.headRotation =
        "وضعیت چرخش سر را مشخص کنید.";
    }

    if (
      Object.keys(
        errors,
      ).length > 0
    ) {
      setFieldErrors(
        errors,
      );

      setError(
        "برای ورود به مرحله تصویربرداری، همه اطلاعات الزامی را تکمیل کنید.",
      );

      focusFirstError(
        errors,
      );

      return;
    }


    
    if (
      ageYears ===
        undefined ||
      heightCm ===
        undefined ||
      weightKg ===
        undefined ||
      !headRotationStatus
    ) {
      return;
    }

    try {
      setSubmitting(
        true,
      );

      const airwayCase =
        await createCase({
          fullName:
            normalizedFullName,

          clinical: {
            fullName:
              normalizedFullName,

            ageYears,

            sex,

            heightCm,

            weightKg,

            neckMobility:
              "unknown",

            headRotationStatus,

            neckRotationDegrees:
              undefined,

            /*
             * از UI حذف شده‌اند.
             */
            mallampatiClass:
              "unknown",

            upperLipBiteClass:
              "unknown",

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

      const message =
        caughtError instanceof
        Error
          ? caughtError.message
          : "";

      switch (
        message
      ) {
        case "PATIENT_NAME_REQUIRED":
          setFieldErrors({
            fullName:
              "نام و نام خانوادگی بیمار را وارد کنید.",
          });

          setError(
            "نام بیمار الزامی است.",
          );
          break;

        case "AGE_REQUIRED":
        case "INVALID_AGE":
          setFieldErrors({
            age:
              "سن بیمار را به‌درستی وارد کنید.",
          });

          setError(
            "اطلاعات بیمار کامل نیست.",
          );
          break;

        case "SEX_REQUIRED":
          setFieldErrors({
            sex:
              "جنسیت بیمار را انتخاب کنید.",
          });

          setError(
            "اطلاعات بیمار کامل نیست.",
          );
          break;

        case "HEIGHT_REQUIRED":
        case "INVALID_HEIGHT":
          setFieldErrors({
            height:
              "قد بیمار را به‌درستی وارد کنید.",
          });

          setError(
            "اطلاعات بیمار کامل نیست.",
          );
          break;

        case "WEIGHT_REQUIRED":
        case "INVALID_WEIGHT":
          setFieldErrors({
            weight:
              "وزن بیمار را به‌درستی وارد کنید.",
          });

          setError(
            "اطلاعات بیمار کامل نیست.",
          );
          break;

        case "HEAD_ROTATION_REQUIRED":
          setFieldErrors({
            headRotation:
              "وضعیت چرخش سر را مشخص کنید.",
          });

          setError(
            "اطلاعات بیمار کامل نیست.",
          );
          break;

        case "OPERATOR_PROFILE_REQUIRED":
          setError(
            "مشخصات پزشک پیدا نشد. صفحه را دوباره بارگذاری کنید.",
          );
          break;

        default:
          setError(
            "ذخیره اطلاعات بیمار انجام نشد. دوباره تلاش کنید.",
          );
      }
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  const fieldClassName = `
    h-14
    w-full
    rounded-2xl
    border
    bg-white
    px-4
    text-base
    text-slate-900
    shadow-sm
    outline-none
    transition
    placeholder:text-slate-400
    focus:ring-4
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

  function getFieldClass(
    invalid:
      boolean,
  ) {
    return `
      ${fieldClassName}
      ${
        invalid
          ? "border-red-400 focus:border-red-500 focus:ring-red-100"
          : "border-slate-200 focus:border-sky-500 focus:ring-sky-100"
      }
    `;
  }

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
            برای ورود به مرحله
            تصویربرداری، تمام اطلاعات
            این صفحه باید تکمیل شوند.
          </p>
        </div>
      </header>

      <form
        onSubmit={
          handleSubmit
        }
        noValidate
        className="
          mt-7
          space-y-6
        "
      >
        <section>
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
            {/* Patient name */}

            <div
              className="
                col-span-2
                min-w-0
              "
            >
              <label
                htmlFor="fullName"
                className={
                  labelClassName
                }
              >
                نام و نام خانوادگی بیمار

                <span
                  className="
                    mr-1
                    text-red-500
                  "
                >
                  *
                </span>
              </label>

              <input
                id="fullName"
                type="text"
                value={
                  fullName
                }
                disabled={
                  submitting
                }
                autoComplete="off"
                aria-invalid={
                  Boolean(
                    fieldErrors.fullName,
                  )
                }
                aria-describedby={
                  fieldErrors.fullName
                    ? "fullName-error"
                    : undefined
                }
                onChange={(
                  event,
                ) => {
                  setFullName(
                    event.target
                      .value,
                  );

                  clearFieldError(
                    "fullName",
                  );
                }}
                placeholder="نام و نام خانوادگی"
                className={
                  getFieldClass(
                    Boolean(
                      fieldErrors.fullName,
                    ),
                  )
                }
              />

              {fieldErrors.fullName && (
                <p
                  id="fullName-error"
                  className="
                    mt-2
                    text-xs
                    font-medium
                    text-red-600
                  "
                >
                  {
                    fieldErrors.fullName
                  }
                </p>
              )}
            </div>

            {/* Age */}

            <div className="min-w-0">
              <label
                htmlFor="age"
                className={
                  labelClassName
                }
              >
                سن

                <span
                  className="
                    mr-1
                    text-red-500
                  "
                >
                  *
                </span>
              </label>

              <NumericInput
                id="age"
                value={age}
                onChange={(
                  value,
                ) => {
                  setAge(
                    value,
                  );

                  clearFieldError(
                    "age",
                  );
                }}
                placeholder="35"
                unit="سال"
                disabled={
                  submitting
                }
                required
                invalid={
                  Boolean(
                    fieldErrors.age,
                  )
                }
                ariaDescribedBy={
                  fieldErrors.age
                    ? "age-error"
                    : undefined
                }
              />

              {fieldErrors.age && (
                <p
                  id="age-error"
                  className="
                    mt-2
                    text-xs
                    font-medium
                    text-red-600
                  "
                >
                  {
                    fieldErrors.age
                  }
                </p>
              )}
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

                <span
                  className="
                    mr-1
                    text-red-500
                  "
                >
                  *
                </span>
              </label>

              <select
                id="sex"
                value={sex}
                disabled={
                  submitting
                }
                aria-invalid={
                  Boolean(
                    fieldErrors.sex,
                  )
                }
                aria-describedby={
                  fieldErrors.sex
                    ? "sex-error"
                    : undefined
                }
                onChange={(
                  event,
                ) => {
                  setSex(
                    event.target
                      .value as BiologicalSex,
                  );

                  clearFieldError(
                    "sex",
                  );
                }}
                className={
                  getFieldClass(
                    Boolean(
                      fieldErrors.sex,
                    ),
                  )
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

              {fieldErrors.sex && (
                <p
                  id="sex-error"
                  className="
                    mt-2
                    text-xs
                    font-medium
                    text-red-600
                  "
                >
                  {
                    fieldErrors.sex
                  }
                </p>
              )}
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

                <span
                  className="
                    mr-1
                    text-red-500
                  "
                >
                  *
                </span>
              </label>

              <NumericInput
                id="height"
                value={
                  height
                }
                onChange={(
                  value,
                ) => {
                  setHeight(
                    value,
                  );

                  clearFieldError(
                    "height",
                  );
                }}
                placeholder="175"
                unit="cm"
                disabled={
                  submitting
                }
                required
                invalid={
                  Boolean(
                    fieldErrors.height,
                  )
                }
                ariaDescribedBy={
                  fieldErrors.height
                    ? "height-error"
                    : undefined
                }
              />

              {fieldErrors.height && (
                <p
                  id="height-error"
                  className="
                    mt-2
                    text-xs
                    font-medium
                    text-red-600
                  "
                >
                  {
                    fieldErrors.height
                  }
                </p>
              )}
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

                <span
                  className="
                    mr-1
                    text-red-500
                  "
                >
                  *
                </span>
              </label>

              <NumericInput
                id="weight"
                value={
                  weight
                }
                onChange={(
                  value,
                ) => {
                  setWeight(
                    value,
                  );

                  clearFieldError(
                    "weight",
                  );
                }}
                placeholder="75"
                unit="kg"
                disabled={
                  submitting
                }
                required
                invalid={
                  Boolean(
                    fieldErrors.weight,
                  )
                }
                ariaDescribedBy={
                  fieldErrors.weight
                    ? "weight-error"
                    : undefined
                }
              />

              {fieldErrors.weight && (
                <p
                  id="weight-error"
                  className="
                    mt-2
                    text-xs
                    font-medium
                    text-red-600
                  "
                >
                  {
                    fieldErrors.weight
                  }
                </p>
              )}
            </div>
          </div>
        </section>



        <section
          id="headRotation"
          tabIndex={-1}
          className="
            outline-none
          "
        >
          <div
            className="
              flex
              items-center
              gap-1
            "
          >
            <h2
              className="
                text-sm
                font-bold
                text-slate-900
              "
            >
              وضعیت چرخش سر
            </h2>

            <span
              className="
                text-red-500
              "
            >
              *
            </span>
          </div>

          <p
            className="
              mt-2
              text-xs
              leading-6
              text-slate-500
            "
          >
            یکی از دو وضعیت زیر را
            حتماً مشخص کنید.
          </p>

          <div
            className="
              mt-4
              grid
              grid-cols-2
              gap-3
            "
          >
            <button
              type="button"
              disabled={
                submitting
              }
              onClick={() => {
                setHeadRotationStatus(
                  "complete",
                );

                clearFieldError(
                  "headRotation",
                );
              }}
              className={`
                flex
                min-h-20
                items-center
                justify-center
                gap-2
                rounded-2xl
                border
                px-3
                text-sm
                font-bold
                transition
                ${
                  headRotationStatus ===
                  "complete"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100"
                    : fieldErrors.headRotation
                      ? "border-red-300 bg-red-50/40 text-slate-700"
                      : "border-slate-200 bg-white text-slate-700"
                }
              `}
            >
              {headRotationStatus ===
                "complete" && (
                <Check
                  size={18}
                />
              )}

              چرخش کامل
            </button>

            <button
              type="button"
              disabled={
                submitting
              }
              onClick={() => {
                setHeadRotationStatus(
                  "incomplete",
                );

                clearFieldError(
                  "headRotation",
                );
              }}
              className={`
                flex
                min-h-20
                items-center
                justify-center
                gap-2
                rounded-2xl
                border
                px-3
                text-sm
                font-bold
                transition
                ${
                  headRotationStatus ===
                  "incomplete"
                    ? "border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-100"
                    : fieldErrors.headRotation
                      ? "border-red-300 bg-red-50/40 text-slate-700"
                      : "border-slate-200 bg-white text-slate-700"
                }
              `}
            >
              {headRotationStatus ===
                "incomplete" && (
                <Check
                  size={18}
                />
              )}

              چرخش ناکامل
            </button>
          </div>

          {fieldErrors.headRotation && (
            <p
              className="
                mt-2
                text-xs
                font-medium
                text-red-600
              "
            >
              {
                fieldErrors.headRotation
              }
            </p>
          )}
        </section>

        {error && (
          <div
            role="alert"
            className="
              rounded-2xl
              border
              border-red-100
              bg-red-50
              p-4
              text-sm
              font-medium
              leading-7
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
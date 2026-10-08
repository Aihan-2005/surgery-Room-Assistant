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
  YesNoUnknown,
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
  | "headRotation"
  | "priorDifficultIntubation";

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
    "priorDifficultIntubation",
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

  const [
    priorDifficultIntubation,
    setPriorDifficultIntubation,
  ] =
    useState<
      YesNoUnknown | null
    >(null);

  function clearFieldError(
    field:
      FormField,
  ) {
    setFieldErrors(
      (
        current,
      ) => {
        if (
          !current[
            field
          ]
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

    setError(
      null,
    );
  }

  function focusFirstError(
    errors:
      FieldErrors,
  ) {
    const firstField =
      FIELD_ORDER.find(
        (
          field,
        ) =>
          Boolean(
            errors[
              field
            ],
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

    setError(
      null,
    );

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

    if (
      !age.trim()
    ) {
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
      sex ===
      "unknown"
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
      heightCm < 30 ||
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
      weightKg < 1 ||
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
      !priorDifficultIntubation
    ) {
      errors.priorDifficultIntubation =
        "سابقه انتوباسیون سخت را مشخص کنید.";
    }

    if (
      Object.keys(
        errors,
      ).length >
      0
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
      !headRotationStatus ||
      !priorDifficultIntubation
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

            priorDifficultIntubation,
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
              "نام بیمار الزامی است.",
          });
          break;

        case "AGE_REQUIRED":
        case "INVALID_AGE":
          setFieldErrors({
            age:
              "سن بیمار معتبر نیست.",
          });
          break;

        case "SEX_REQUIRED":
          setFieldErrors({
            sex:
              "جنسیت بیمار را انتخاب کنید.",
          });
          break;

        case "HEIGHT_REQUIRED":
        case "INVALID_HEIGHT":
          setFieldErrors({
            height:
              "قد بیمار معتبر نیست.",
          });
          break;

        case "WEIGHT_REQUIRED":
        case "INVALID_WEIGHT":
          setFieldErrors({
            weight:
              "وزن بیمار معتبر نیست.",
          });
          break;

        case "HEAD_ROTATION_REQUIRED":
          setFieldErrors({
            headRotation:
              "وضعیت چرخش سر را مشخص کنید.",
          });
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

  function optionClass(
    selected:
      boolean,
    invalid:
      boolean,
  ) {
    if (
      selected
    ) {
      return `
        border-sky-600
        bg-sky-50
        text-sky-800
        ring-2
        ring-sky-100
      `;
    }

    if (
      invalid
    ) {
      return `
        border-red-300
        bg-red-50/40
        text-slate-700
      `;
    }

    return `
      border-slate-200
      bg-white
      text-slate-700
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
            active:scale-95
          "
        >
          <ArrowRight
            size={19}
          />
        </button>

        <div
          className="mt-5"
        >
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
            برای ورود به مرحله تصویربرداری،
            تمام اطلاعات الزامی را تکمیل کنید.
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
            <div
              className="
                col-span-2
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
                onChange={(
                  event,
                ) => {
                  setFullName(
                    event.target.value,
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

            <div>
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
                value={
                  age
                }
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
              />

              {fieldErrors.age && (
                <p
                  className="
                    mt-2
                    text-xs
                    text-red-600
                  "
                >
                  {
                    fieldErrors.age
                  }
                </p>
              )}
            </div>

            <div>
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
                value={
                  sex
                }
                disabled={
                  submitting
                }
                onChange={(
                  event,
                ) => {
                  setSex(
                    event.target
                      .value as
                      BiologicalSex,
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
                <option
                  value="unknown"
                >
                  انتخاب کنید
                </option>

                <option
                  value="male"
                >
                  مرد
                </option>

                <option
                  value="female"
                >
                  زن
                </option>
              </select>

              {fieldErrors.sex && (
                <p
                  className="
                    mt-2
                    text-xs
                    text-red-600
                  "
                >
                  {
                    fieldErrors.sex
                  }
                </p>
              )}
            </div>

            <div>
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
              />

              {fieldErrors.height && (
                <p
                  className="
                    mt-2
                    text-xs
                    text-red-600
                  "
                >
                  {
                    fieldErrors.height
                  }
                </p>
              )}
            </div>

            <div>
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
              />

              {fieldErrors.weight && (
                <p
                  className="
                    mt-2
                    text-xs
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
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-4
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

          <div
            className="
              mt-4
              grid
              grid-cols-2
              gap-3
            "
          >
            {(
              [
                [
                  "complete",
                  "چرخش کامل",
                ],
                [
                  "incomplete",
                  "چرخش ناکامل",
                ],
              ] as const
            ).map(
              ([
                value,
                label,
              ]) => (
                <button
                  key={
                    value
                  }
                  type="button"
                  disabled={
                    submitting
                  }
                  onClick={() => {
                    setHeadRotationStatus(
                      value,
                    );

                    clearFieldError(
                      "headRotation",
                    );
                  }}
                  className={`
                    flex
                    min-h-16
                    items-center
                    justify-center
                    gap-2
                    rounded-2xl
                    border
                    px-3
                    text-sm
                    font-bold
                    ${optionClass(
                      headRotationStatus ===
                        value,
                      Boolean(
                        fieldErrors.headRotation,
                      ),
                    )}
                  `}
                >
                  {headRotationStatus ===
                    value && (
                    <Check
                      size={18}
                    />
                  )}

                  {
                    label
                  }
                </button>
              ),
            )}
          </div>

          {fieldErrors.headRotation && (
            <p
              className="
                mt-2
                text-xs
                text-red-600
              "
            >
              {
                fieldErrors.headRotation
              }
            </p>
          )}
        </section>

        <section
          id="priorDifficultIntubation"
          tabIndex={-1}
          className="
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-4
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
              سابقه انتوباسیون سخت
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
            آیا بیمار سابقه انتوباسیون
            دشوار داشته است؟
          </p>

          <div
            className="
              mt-4
              grid
              grid-cols-3
              gap-2
            "
          >
            {(
              [
                [
                  "yes",
                  "آره",
                ],
                [
                  "no",
                  "خیر",
                ],
                [
                  "unknown",
                  "نمی‌دانم",
                ],
              ] as const
            ).map(
              ([
                value,
                label,
              ]) => (
                <button
                  key={
                    value
                  }
                  type="button"
                  disabled={
                    submitting
                  }
                  onClick={() => {
                    setPriorDifficultIntubation(
                      value,
                    );

                    clearFieldError(
                      "priorDifficultIntubation",
                    );
                  }}
                  className={`
                    flex
                    min-h-16
                    items-center
                    justify-center
                    gap-1.5
                    rounded-2xl
                    border
                    px-2
                    text-xs
                    font-bold
                    ${optionClass(
                      priorDifficultIntubation ===
                        value,
                      Boolean(
                        fieldErrors.priorDifficultIntubation,
                      ),
                    )}
                  `}
                >
                  {priorDifficultIntubation ===
                    value && (
                    <Check
                      size={16}
                    />
                  )}

                  {
                    label
                  }
                </button>
              ),
            )}
          </div>

          {fieldErrors.priorDifficultIntubation && (
            <p
              className="
                mt-2
                text-xs
                text-red-600
              "
            >
              {
                fieldErrors.priorDifficultIntubation
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
              leading-7
              text-red-700
            "
          >
            {
              error
            }
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
            disabled:opacity-60
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


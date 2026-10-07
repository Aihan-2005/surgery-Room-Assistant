"use client";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";

import {
  finalizeOutcome,
  getCase,
} from "@/lib/db/database";

import type {
  AirwayCase,
  CormackLehaneGrade,
  InitialAirwayDevice,
} from "@/lib/domain/types";

import {
  parseOptionalNumber,
} from "@/lib/utils/numbers";

export default function OutcomePage() {
  const params =
    useParams<{
      caseId: string;
    }>();

  const router =
    useRouter();

  const caseId =
    params.caseId;

  const [
    airwayCase,
    setAirwayCase,
  ] =
    useState<AirwayCase | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    attemptCount,
    setAttemptCount,
  ] = useState("1");

  const [
    cormack,
    setCormack,
  ] =
    useState<CormackLehaneGrade>(
      "unknown",
    );

  const [
    initialDevice,
    setInitialDevice,
  ] =
    useState<InitialAirwayDevice>(
      "unknown",
    );

  const [
    strategyEscalation,
    setStrategyEscalation,
  ] = useState(false);

  const [
    bougieUsed,
    setBougieUsed,
  ] = useState(false);

  const [
    styletUsed,
    setStyletUsed,
  ] = useState(false);

  const [
    videoLaryngoscopeUsed,
    setVideoLaryngoscopeUsed,
  ] = useState(false);

  const [
    supraglotticRescueUsed,
    setSupraglotticRescueUsed,
  ] = useState(false);

  const [
    operatorExperience,
    setOperatorExperience,
  ] = useState("");

  const [
    lowestSpO2,
    setLowestSpO2,
  ] = useState("");

  const [
    complications,
    setComplications,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const result =
          await getCase(
            caseId,
          );

        if (!result) {
          setError(
            "Case پیدا نشد.",
          );

          return;
        }

        setAirwayCase(
          result,
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [caseId]);

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);

    const attempts =
      Number(
        attemptCount,
      );

    if (
      !Number.isInteger(
        attempts,
      ) ||
      attempts < 1
    ) {
      setError(
        "تعداد attempt معتبر نیست.",
      );

      return;
    }

    try {
      setSubmitting(true);

      await finalizeOutcome(
        caseId,
        {
          attemptCount:
            attempts,

          cormackLehaneGrade:
            cormack,

          initialDevice,

          strategyEscalation,

          bougieUsed,

          styletUsed,

          videoLaryngoscopeUsed,

          supraglotticRescueUsed,

          operatorExperienceYears:
            parseOptionalNumber(
              operatorExperience,
            ),

          lowestSpO2Percent:
            parseOptionalNumber(
              lowestSpO2,
            ),

          complications:
            complications.trim() ||
            undefined,

          notes:
            notes.trim() ||
            undefined,
        },
      );

      router.push(
        "/queue",
      );
    } catch (caughtError) {
      console.error(
        caughtError,
      );

      setError(
        "ثبت Outcome انجام نشد.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div
        className="
          flex
          min-h-[70vh]
          items-center
          justify-center
        "
      >
        <LoaderCircle
          className="animate-spin"
        />
      </div>
    );
  }

  if (!airwayCase) {
    return (
      <div className="p-5">
        {error}
      </div>
    );
  }

  if (
    airwayCase.studyStatus !==
    "awaiting_outcome"
  ) {
    return (
      <div className="p-5">
        <div
          className="
            rounded-3xl
            bg-amber-50
            p-5
            text-sm
            leading-7
            text-amber-900
          "
        >
          Outcome فقط بعد از
          نهایی‌شدن و قفل‌شدن
          اطلاعات Pre-op قابل ثبت
          است.
        </div>
      </div>
    );
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
        <p
          className="
            text-xs
            font-semibold
            text-violet-700
          "
        >
          مرحله ۳
        </p>

        <h1
          className="
            mt-1
            text-2xl
            font-bold
            text-slate-950
          "
        >
          Outcome انتوباسیون
        </h1>

        <p
          className="
            mt-2
            text-sm
            text-slate-500
          "
        >
          Case:{" "}
          <strong>
            {
              airwayCase.caseCode
            }
          </strong>
        </p>
      </header>

      <form
        onSubmit={
          handleSubmit
        }
        className="
          mt-6
          space-y-5
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
          <label className="block">
            <span className="text-sm font-bold">
              تعداد Attempts
            </span>

            <input
              type="number"
              min={1}
              step={1}
              value={
                attemptCount
              }
              onChange={(
                event,
              ) =>
                setAttemptCount(
                  event.target.value,
                )
              }
              className="
                mt-2
                min-h-14
                w-full
                rounded-2xl
                border
                border-slate-200
                px-4
              "
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-bold">
              Cormack–Lehane
            </span>

            <select
              value={String(
                cormack,
              )}
              onChange={(
                event,
              ) =>
                setCormack(
                  event.target
                    .value ===
                    "unknown"
                    ? "unknown"
                    : (Number(
                        event.target
                          .value,
                      ) as CormackLehaneGrade),
                )
              }
              className="
                mt-2
                min-h-14
                w-full
                rounded-2xl
                border
                border-slate-200
                px-4
              "
            >
              <option value="unknown">
                نامشخص
              </option>

              <option value="1">
                Grade I
              </option>

              <option value="2">
                Grade II
              </option>

              <option value="3">
                Grade III
              </option>

              <option value="4">
                Grade IV
              </option>
            </select>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-bold">
              وسیله اولیه
            </span>

            <select
              value={
                initialDevice
              }
              onChange={(
                event,
              ) =>
                setInitialDevice(
                  event.target
                    .value as InitialAirwayDevice,
                )
              }
              className="
                mt-2
                min-h-14
                w-full
                rounded-2xl
                border
                border-slate-200
                px-4
              "
            >
              <option value="unknown">
                نامشخص
              </option>

              <option value="direct_laryngoscope">
                Direct laryngoscope
              </option>

              <option value="video_laryngoscope">
                Videolaryngoscope
              </option>

              <option value="other">
                Other
              </option>
            </select>
          </label>
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
          <h2 className="font-bold">
            تغییر استراتژی / ابزار
          </h2>

          {[
            [
              "strategy",
              "تغییر یا escalation استراتژی",
              strategyEscalation,
              setStrategyEscalation,
            ],
            [
              "bougie",
              "استفاده از Bougie",
              bougieUsed,
              setBougieUsed,
            ],
            [
              "stylet",
              "استفاده از Stylet",
              styletUsed,
              setStyletUsed,
            ],
            [
              "video",
              "استفاده از Videolaryngoscope",
              videoLaryngoscopeUsed,
              setVideoLaryngoscopeUsed,
            ],
            [
              "sga",
              "Rescue با supraglottic airway",
              supraglotticRescueUsed,
              setSupraglotticRescueUsed,
            ],
          ].map(
            ([
              key,
              label,
              checked,
              setter,
            ]) => (
              <label
                key={
                  key as string
                }
                className="
                  mt-4
                  flex
                  items-center
                  gap-3
                "
              >
                <input
                  type="checkbox"
                  checked={
                    checked as boolean
                  }
                  onChange={(
                    event,
                  ) =>
                    (
                      setter as (
                        value: boolean,
                      ) => void
                    )(
                      event.target
                        .checked,
                    )
                  }
                  className="size-5"
                />

                <span className="text-sm">
                  {
                    label as string
                  }
                </span>
              </label>
            ),
          )}
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
          <label className="block">
            <span className="text-sm font-bold">
              سابقه اپراتور
            </span>

            <input
              inputMode="decimal"
              value={
                operatorExperience
              }
              onChange={(
                event,
              ) =>
                setOperatorExperience(
                  event.target.value,
                )
              }
              placeholder="سال"
              className="
                mt-2
                min-h-14
                w-full
                rounded-2xl
                border
                border-slate-200
                px-4
              "
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-bold">
              Lowest SpO₂
            </span>

            <input
              inputMode="decimal"
              value={
                lowestSpO2
              }
              onChange={(
                event,
              ) =>
                setLowestSpO2(
                  event.target.value,
                )
              }
              placeholder="%"
              className="
                mt-2
                min-h-14
                w-full
                rounded-2xl
                border
                border-slate-200
                px-4
              "
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-bold">
              Complications
            </span>

            <textarea
              rows={3}
              value={
                complications
              }
              onChange={(
                event,
              ) =>
                setComplications(
                  event.target.value,
                )
              }
              className="
                mt-2
                w-full
                rounded-2xl
                border
                border-slate-200
                p-3
              "
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-bold">
              Notes
            </span>

            <textarea
              rows={3}
              value={notes}
              onChange={(
                event,
              ) =>
                setNotes(
                  event.target.value,
                )
              }
              className="
                mt-2
                w-full
                rounded-2xl
                border
                border-slate-200
                p-3
              "
            />
          </label>
        </section>

        {error && (
          <div
            className="
              rounded-2xl
              bg-red-50
              p-4
              text-sm
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
            bg-emerald-600
            font-bold
            text-white
            disabled:opacity-50
          "
        >
          <CheckCircle2
            size={20}
          />

          {submitting
            ? "در حال ذخیره..."
            : "نهایی‌سازی Outcome"}
        </button>
      </form>
    </div>
  );
}
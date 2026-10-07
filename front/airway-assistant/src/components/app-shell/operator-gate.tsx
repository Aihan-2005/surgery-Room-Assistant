"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";

import {
  LoaderCircle,
  Stethoscope,
} from "lucide-react";

import {
  getLegacyOperatorName,
  getOperatorProfile,
  registerOperator,
} from "@/lib/profile/operator-profile";

interface OperatorGateProps {
  children:
    ReactNode;
}

type GateState =
  | "loading"
  | "setup"
  | "ready";

export function OperatorGate({
  children,
}: OperatorGateProps) {
  const [
    state,
    setState,
  ] =
    useState<GateState>(
      "loading",
    );

  const [
    fullName,
    setFullName,
  ] =
    useState("");

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

  useEffect(() => {
    const profile =
      getOperatorProfile();

    if (profile) {
      setState(
        "ready",
      );

      return;
    }

    const legacyName =
      getLegacyOperatorName();

    if (legacyName) {
      setFullName(
        legacyName,
      );
    }

    setState(
      "setup",
    );
  }, []);

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);

    const normalizedName =
      fullName
        .replace(
          /\s+/g,
          " ",
        )
        .trim();

    if (
      !normalizedName
    ) {
      setError(
        "نام و نام خانوادگی پزشک را وارد کنید.",
      );

      return;
    }

    try {
      setSubmitting(
        true,
      );

      await registerOperator(
        normalizedName,
      );

      setState(
        "ready",
      );
    } catch (
      caughtError
    ) {
      console.error(
        caughtError,
      );

      const code =
        caughtError instanceof
        Error
          ? caughtError.message
          : "";

      switch (code) {
        case "BACKEND_NOT_CONFIGURED":
          setError(
            "آدرس Backend تنظیم نشده است.",
          );
          break;

        case "REGISTRATION_RATE_LIMITED":
          setError(
            "تعداد تلاش‌های ثبت‌نام بیش از حد مجاز بوده است. کمی بعد دوباره تلاش کنید.",
          );
          break;

        default:
          setError(
            "برای اولین فعال‌سازی باید به Backend متصل باشید. اتصال سرور را بررسی و دوباره تلاش کنید.",
          );
      }
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  if (
    state === "loading"
  ) {
    return (
      <div
        className="
          flex
          min-h-screen
          items-center
          justify-center
          bg-slate-50
        "
      >
        <LoaderCircle
          size={28}
          className="
            animate-spin
            text-sky-700
          "
        />
      </div>
    );
  }

  if (
    state === "setup"
  ) {
    return (
      <main
        className="
          mx-auto
          flex
          min-h-screen
          max-w-md
          items-center
          bg-slate-50
          px-4
          py-10
        "
      >
        <section
          className="
            w-full
            rounded-3xl
            border
            border-slate-200
            bg-white
            p-5
            shadow-sm
          "
        >
          <div
            className="
              flex
              size-12
              items-center
              justify-center
              rounded-2xl
              bg-sky-50
              text-sky-700
            "
          >
            <Stethoscope
              size={25}
            />
          </div>

          <p
            className="
              mt-5
              text-xs
              font-semibold
              text-sky-700
            "
          >
            فعال‌سازی اولیه
          </p>

          <h1
            className="
              mt-1
              text-2xl
              font-bold
              text-slate-950
            "
          >
            مشخصات پزشک
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-7
              text-slate-500
            "
          >
            این اطلاعات فقط در اولین
            ورود دریافت می‌شود و دستگاه
            شما در سرور ثبت خواهد شد.
          </p>

          <form
            onSubmit={
              handleSubmit
            }
            noValidate
            className="mt-6"
          >
            <label
              htmlFor="operatorName"
              className="
                mb-2
                block
                text-sm
                font-bold
                text-slate-800
              "
            >
              نام و نام خانوادگی پزشک

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
              id="operatorName"
              type="text"
              autoFocus
              autoComplete="name"
              disabled={
                submitting
              }
              value={
                fullName
              }
              onChange={(
                event,
              ) => {
                setFullName(
                  event.target
                    .value,
                );

                setError(
                  null,
                );
              }}
              placeholder="مثلاً دکتر علی رضایی"
              aria-invalid={
                error
                  ? true
                  : undefined
              }
              className={`
                h-14
                w-full
                rounded-2xl
                border
                bg-white
                px-4
                text-base
                text-slate-900
                outline-none
                transition
                placeholder:text-slate-400
                focus:ring-4
                disabled:bg-slate-100
                ${
                  error
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-200 focus:border-sky-500 focus:ring-sky-100"
                }
              `}
            />

            {error && (
              <p
                role="alert"
                className="
                  mt-3
                  text-xs
                  font-medium
                  leading-6
                  text-red-600
                "
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                submitting
              }
              className="
                mt-5
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
                disabled:opacity-60
                active:scale-[0.99]
              "
            >
              {submitting && (
                <LoaderCircle
                  size={19}
                  className="animate-spin"
                />
              )}

              {submitting
                ? "در حال ثبت دستگاه..."
                : "ورود به برنامه"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return children;
}
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
  createOperatorProfile,
  getOperatorProfile,
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
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  useEffect(() => {
    const profile =
      getOperatorProfile();

    setState(
      profile
        ? "ready"
        : "setup",
    );
  }, []);

  function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);

    const normalizedName =
      fullName
        .replace(/\s+/g, " ")
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
      createOperatorProfile(
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

      setError(
        "ثبت اطلاعات پزشک انجام نشد.",
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
            راه‌اندازی اولیه
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
            ورود به برنامه دریافت
            می‌شود.
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
              value={
                fullName
              }
              onChange={(
                event,
              ) => {
                setFullName(
                  event.target.value,
                );

                if (error) {
                  setError(null);
                }
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
                  mt-2
                  text-xs
                  font-medium
                  text-red-600
                "
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="
                mt-5
                flex
                h-14
                w-full
                items-center
                justify-center
                rounded-2xl
                bg-sky-700
                px-5
                font-bold
                text-white
                shadow-sm
                transition
                hover:bg-sky-800
                active:scale-[0.99]
              "
            >
              ورود به برنامه
            </button>
          </form>
        </section>
      </main>
    );
  }

  return children;
}
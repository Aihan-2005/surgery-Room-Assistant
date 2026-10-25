"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  LoaderCircle,
  RefreshCw,
  WifiOff,
} from "lucide-react";

import {
  getSyncedPhotoBlob,
} from "@/lib/api/synced-photos";

interface RemotePhotoImageProps {
  caseId: string;
  photoId: string;
  alt: string;
  localFallbackUrl?: string;
}

export function RemotePhotoImage({
  caseId,
  photoId,
  alt,
  localFallbackUrl = "",
}: RemotePhotoImageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [visible, setVisible] = useState(false);
  const [serverUrl, setServerUrl] =
    useState<string | null>(null);

  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(
        () => setVisible(true),
        0,
      );

      return () => window.clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries.some(
          (entry) => entry.isIntersecting,
        );

        setVisible(inView);

        if (!inView) {
          setServerUrl(null);
          setError(false);
        }
      },
      { rootMargin: "250px" },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    const controller = new AbortController();

    void getSyncedPhotoBlob(
      caseId,
      photoId,
      controller.signal,
    )
      .then((blob) => {
        if (cancelled) return;

        const nextUrl = URL.createObjectURL(blob);
        const previousUrl = objectUrlRef.current;

        objectUrlRef.current = nextUrl;
        setServerUrl(nextUrl);
        setError(false);

        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();

      const url = objectUrlRef.current;

      if (url) {
        URL.revokeObjectURL(url);
      }

      objectUrlRef.current = null;
    };
  }, [visible, caseId, photoId, attempt]);

  const src =
    !error && serverUrl
      ? serverUrl
      : localFallbackUrl;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full bg-slate-100"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Authenticated images use temporary blob URLs.
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-slate-600">
          {error ? (
            <WifiOff size={22} />
          ) : (
            <LoaderCircle
              size={22}
              className="animate-spin"
            />
          )}

          <span>
            {error
              ? "دریافت عکس از سرور انجام نشد."
              : "در حال دریافت امن عکس از سرور..."}
          </span>
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 right-2 flex justify-center">
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white/95 px-3 py-1 text-xs font-bold text-sky-800 shadow"
            onClick={() => {
              const old = objectUrlRef.current;

              if (old) {
                URL.revokeObjectURL(old);
              }

              objectUrlRef.current = null;
              setServerUrl(null);
              setError(false);
              setAttempt((number) => number + 1);
            }}
          >
            <RefreshCw size={13} />
            تلاش مجدد
          </button>
        </div>
      )}
    </div>
  );
}

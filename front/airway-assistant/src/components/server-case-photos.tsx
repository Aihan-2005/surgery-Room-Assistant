"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { fetchServerPhoto, fetchServerPhotos, type ServerPhoto } from "@/lib/api/server-photos";

const POSITION_LABELS: Record<string, string> = {
  front: "نمای روبرو", mallampati: "Mallampati", open_mouth: "دهان باز",
  upper_lip_bite: "گاز گرفتن لب بالا", side: "نمای جانبی", head_back_side: "سر به عقب",
};

function RemotePhoto({ caseId, photo }: { caseId: string; photo: ServerPhoto }) {
  const frame = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const label = POSITION_LABELS[photo.position] ?? photo.position;

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 35_000);
    void fetchServerPhoto(caseId, photo.id, controller.signal).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [caseId, photo.id, visible, attempt]);

  return (
    <figure ref={frame} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      {url ? (
        <Image src={url} alt={label} width={800} height={600} unoptimized
          onError={() => { setUrl(null); setError(true); }}
          className="h-auto w-full object-contain" />
      ) : error ? (
        <div className="p-4 text-xs leading-6 text-red-700" role="status">
          تصویر دریافت نشد. اتصال اینترنت را بررسی کنید.
          <button type="button" className="mt-2 block font-bold text-sky-700"
            onClick={() => { setError(false); setAttempt((value) => value + 1); }}>تلاش دوباره</button>
        </div>
      ) : <p className="p-6 text-center text-xs text-slate-500" role="status">در حال دریافت تصویر…</p>}
      <figcaption className="px-3 py-2 text-xs text-slate-600">{label}</figcaption>
    </figure>
  );
}

function PhotoList({ caseId }: { caseId: string }) {
  const [photos, setPhotos] = useState<ServerPhoto[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    void fetchServerPhotos(caseId, controller.signal).then((result) => {
      if (active) setPhotos(result);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [caseId, attempt]);

  if (error) return (
    <div role="status" className="mt-3 text-xs leading-6 text-red-700">
      دریافت تصاویر سرور انجام نشد. برای مشاهده تصاویر سرور باید آنلاین باشید.
      <button type="button" className="mt-2 block font-bold text-sky-700"
        onClick={() => { setError(false); setAttempt((value) => value + 1); }}>تلاش دوباره</button>
    </div>
  );
  if (photos === null) return <p role="status" className="mt-3 text-xs text-slate-500">در حال دریافت فهرست تصاویر…</p>;
  if (!photos.length) return <p className="mt-3 text-xs text-slate-500">هنوز تصویری برای این پرونده روی سرور ذخیره نشده است.</p>;
  return <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
    {photos.map((photo) => <RemotePhoto key={photo.id} caseId={caseId} photo={photo} />)}
  </div>;
}

export function ServerCasePhotos({ caseId, initiallyOpen = false }: { caseId: string; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className="mt-3" aria-label="تصاویر ذخیره‌شده در سرور">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className="min-h-11 rounded-xl bg-sky-50 px-4 text-xs font-bold text-sky-700">
        {open ? "بستن تصاویر سرور" : "مشاهده تصاویر سرور"}
      </button>
      {open && <PhotoList key={caseId} caseId={caseId} />}
    </section>
  );
}

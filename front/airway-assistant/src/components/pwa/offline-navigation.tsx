"use client";

import { useEffect } from "react";

const OFFLINE_PAGES = new Set([
  "/",
  "/cases",
  "/cases/new",
  "/queue",
  "/capture",
]);

const LEGACY_CAPTURE =
  /^\/cases\/([0-9a-fA-F-]{36})\/capture\/?$/;

export function OfflineNavigation() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) {
        return;
      }

      const link = event.target.closest("a[href]");

      if (!link) return;

      if (
        link.hasAttribute("download") ||
        (link.getAttribute("target") &&
          link.getAttribute("target") !== "_self")
      ) {
        return;
      }

      const href = link.getAttribute("href");

      if (!href || href.startsWith("#")) {
        return;
      }

      let target: URL;

      try {
        target = new URL(
          href,
          window.location.href,
        );
      } catch {
        return;
      }

      if (
        target.origin !== window.location.origin
      ) {
        return;
      }

      const legacy = target.pathname.match(
        LEGACY_CAPTURE,
      );

      if (legacy) {
        target = new URL(
          `/capture?caseId=${encodeURIComponent(
            legacy[1],
          )}`,
          window.location.origin,
        );
      } else if (
        !OFFLINE_PAGES.has(target.pathname)
      ) {
        return;
      }

      if (
        target.href === window.location.href
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      window.location.assign(target.href);
    }

    document.addEventListener(
      "click",
      handleClick,
      true,
    );

    return () => {
      document.removeEventListener(
        "click",
        handleClick,
        true,
      );
    };
  }, []);

  return null;
}
"use client";

import Link from "next/link";

import {
  ClipboardPlus,
  Home,
  UploadCloud,
} from "lucide-react";

import { usePathname } from "next/navigation";

const navigation = [
  {
    href: "/",
    label: "خانه",
    icon: Home,
  },

  {
    href: "/cases/new",
    label: "ارزیابی جدید",
    icon: ClipboardPlus,
  },

  {
    href: "/queue",
    label: "صف ارسال",
    icon: UploadCloud,
  },
];

export function BottomNav() {
  const pathname =
    usePathname();

  return (
    <nav
      className="
        fixed
        bottom-0
        left-0
        right-0
        z-50
        mx-auto
        max-w-md
        border-t
        border-slate-200
        bg-white/95
        px-3
        pb-[calc(env(safe-area-inset-bottom)+8px)]
        pt-2
        backdrop-blur
      "
    >
      <div
        className="
          grid
          grid-cols-3
          gap-2
        "
      >
        {navigation.map(
          ({
            href,
            label,
            icon: Icon,
          }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(
                    href,
                  );

            return (
              <Link
                href={href}
                key={href}
                className={`
                  flex
                  min-h-14
                  flex-col
                  items-center
                  justify-center
                  gap-1
                  rounded-xl
                  text-xs
                  font-medium
                  transition
                  ${
                    active
                      ? "bg-sky-50 text-sky-700"
                      : "text-slate-500 hover:bg-slate-50"
                  }
                `}
              >
                <Icon
                  size={21}
                  strokeWidth={
                    active
                      ? 2.4
                      : 2
                  }
                />

                {label}
              </Link>
            );
          },
        )}
      </div>
    </nav>
  );
}
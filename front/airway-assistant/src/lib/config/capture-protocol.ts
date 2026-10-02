import type { CaptureKind } from "@/lib/domain/types";

export interface CaptureStep {
  kind: CaptureKind;
  title: string;
  shortTitle: string;
  description: string;
  required: boolean;
  instructions: string[];
}

export const CAPTURE_PROTOCOL: CaptureStep[] = [
  {
    kind: "upper_lip_bite_front",

    title: "نمای روبرو — Upper Lip Bite",

    shortTitle: "نمای روبرو",

    description:
      "تصویر روبروی بیمار در هنگام انجام آزمون گاز گرفتن لب بالا.",

    required: true,

    instructions: [
      "صورت بیمار کاملاً داخل کادر باشد.",
      "بیمار آزمون گاز گرفتن لب بالا را انجام دهد.",
      "نور مستقیم و شدید روی صورت نباشد.",
      "تصویر تار نباشد.",
      "در صورت استفاده از الگوی مرجع، الگو داخل تصویر دیده شود.",
    ],
  },

  {
    kind: "lateral_neutral",

    title: "نمای جانبی — Lateral Neutral",

    shortTitle: "نمای کنار",

    description:
      "تصویر جانبی صورت در وضعیت خنثی سر.",

    required: true,

    instructions: [
      "نمای جانبی صورت و فک مشخص باشد.",
      "سر بیمار در وضعیت خنثی قرار داشته باشد.",
      "کل ناحیه صورت و زیر فک داخل کادر قرار بگیرد.",
      "تصویر تار نباشد.",
      "در صورت استفاده از الگوی مرجع، الگو داخل تصویر دیده شود.",
    ],
  },
];
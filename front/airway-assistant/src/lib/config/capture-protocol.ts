import type {
  CaptureKind,
} from "@/lib/domain/types";

export interface CaptureStep {
  kind: CaptureKind;

  title: string;

  shortTitle: string;

  description: string;

  required: boolean;

  instructions: string[];
}

export const CAPTURE_PROTOCOL:
  CaptureStep[] = [
  {
    kind:
      "upper_lip_bite_front",

    title:
      "نمای روبرو — Upper Lip Bite",

    shortTitle:
      "نمای روبرو",

    description:
      "تصویر روبروی بیمار هنگام انجام آزمون گاز گرفتن لب بالا.",

    required: true,

    instructions: [
      "صورت بیمار در مرکز تصویر قرار بگیرد.",
      "صورت و بخش زیر فک کاملاً داخل کادر باشند.",
      "بیمار آزمون گاز گرفتن لب بالا را انجام دهد.",
      "از حرکت بیمار هنگام ثبت تصویر جلوگیری شود.",
      "نور روی صورت یکنواخت باشد.",
      "تصویر تار نباشد.",
      "در صورت استفاده از Marker، Marker کاملاً قابل مشاهده باشد.",
    ],
  },

  {
    kind:
      "lateral_neutral",

    title:
      "نمای جانبی — Neutral",

    shortTitle:
      "نمای جانبی",

    description:
      "تصویر جانبی صورت بیمار در وضعیت خنثی سر.",

    required: true,

    instructions: [
      "نمای جانبی صورت ثبت شود.",
      "سر بیمار در وضعیت خنثی قرار داشته باشد.",
      "چانه، فک و قسمت قدامی گردن داخل تصویر باشند.",
      "فاصله دوربین تا بیمار تا حد امکان ثابت باشد.",
      "تصویر تار نباشد.",
      "در صورت استفاده از Marker، Marker کاملاً قابل مشاهده باشد.",
    ],
  },
];
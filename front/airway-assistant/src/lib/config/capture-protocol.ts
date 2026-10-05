import type {
  CaptureKind,
} from "@/lib/domain/types";

export type CaptureGuideVariant =
  | "front"
  | "mallampati"
  | "mouth-open"
  | "lateral";

export interface CaptureStep {
  kind: CaptureKind;

  title: string;

  shortTitle: string;

  description: string;

  liveInstruction: string;

  guide: CaptureGuideVariant;

  required: boolean;

  instructions: string[];
}

export const CAPTURE_PROTOCOL: CaptureStep[] = [
  {
    kind: "front_neutral",

    title: "نمای روبرو — Neutral",

    shortTitle: "نمای روبرو",

    description:
      "تصویر مستقیم از روبروی صورت بیمار در وضعیت طبیعی.",

    liveInstruction:
      "صورت روبه‌روی دوربین باشد و در مرکز کادر قرار بگیرد.",

    guide: "front",

    required: true,

    instructions: [
      "بیمار مستقیماً روبه‌روی دوربین قرار بگیرد.",
      "سر در وضعیت طبیعی و خنثی باشد.",
      "صورت، چانه و بخش بالایی گردن داخل تصویر باشند.",
      "صورت در مرکز کادر قرار بگیرد.",
      "نور روی صورت یکنواخت باشد.",
      "تصویر تار نباشد.",
    ],
  },

  {
    kind: "mallampati",

    title: "نمای Mallampati",

    shortTitle: "Mallampati",

    description:
      "تصویر روبرو با دهان کاملاً باز و زبان بیرون.",

    liveInstruction:
      "دهان کاملاً باز و زبان بیرون باشد؛ صورت همچنان روبه‌روی دوربین بماند.",

    guide: "mallampati",

    required: true,

    instructions: [
      "بیمار روبه‌روی دوربین قرار بگیرد.",
      "دهان تا حد امکان باز باشد.",
      "زبان تا حد امکان بیرون آورده شود.",
      "سر در وضعیت طبیعی قرار داشته باشد.",
      "داخل دهان به‌وضوح قابل مشاهده باشد.",
      "نور کافی روی صورت و داخل دهان وجود داشته باشد.",
      "تصویر تار نباشد.",
    ],
  },

  {
    kind: "mouth_open",

    title: "نمای دهان باز",

    shortTitle: "دهان باز",

    description:
      "تصویر روبرو با دهان باز، بدون بیرون آوردن زبان.",

    liveInstruction:
      "دهان باز باشد و زبان در وضعیت طبیعی داخل دهان باقی بماند.",

    guide: "mouth-open",

    required: true,

    instructions: [
      "بیمار مستقیماً روبه‌روی دوربین قرار بگیرد.",
      "دهان کاملاً باز باشد.",
      "زبان بیرون آورده نشود.",
      "صورت در مرکز کادر قرار داشته باشد.",
      "داخل دهان تا حد امکان واضح باشد.",
      "نور کافی وجود داشته باشد.",
      "تصویر تار نباشد.",
    ],
  },

  {
    kind: "lateral_neutral",

    title: "نمای جانبی — Neutral",

    shortTitle: "نمای جانبی",

    description:
      "تصویر جانبی صورت بیمار در وضعیت خنثی سر.",

    liveInstruction:
      "صورت به‌صورت کامل از کنار دیده شود و سر در وضعیت خنثی باشد.",

    guide: "lateral",

    required: true,

    instructions: [
      "صورت بیمار از نمای جانبی ثبت شود.",
      "سر در وضعیت طبیعی و خنثی قرار داشته باشد.",
      "چانه، فک و بخش قدامی گردن در تصویر دیده شوند.",
      "زاویه دوربین تا حد امکان هم‌سطح صورت باشد.",
      "نور روی صورت یکنواخت باشد.",
      "تصویر تار نباشد.",
    ],
  },
];
import type {
  CaptureKind,
} from "@/lib/domain/types";

export type CaptureGuideVariant =
  | "front"
  | "mallampati"
  | "mouth-open"
  | "upper-lip-bite"
  | "lateral"
  | "head-back-side";

export interface CaptureStep {
  kind:
    CaptureKind;

  title:
    string;

  shortTitle:
    string;

  description:
    string;

  liveInstruction:
    string;

  guide:
    CaptureGuideVariant;

  required:
    boolean;

  instructions:
    string[];
}

export const CAPTURE_PROTOCOL:
  CaptureStep[] = [
    {
      kind:
        "front_neutral",

      title:
        "نمای روبرو — Neutral",

      shortTitle:
        "نمای روبرو",

      description:
        "تصویر مستقیم از روبروی صورت بیمار در وضعیت طبیعی.",

      liveInstruction:
        "صورت روبه‌روی دوربین باشد و در مرکز کادر قرار بگیرد.",

      guide:
        "front",

      required:
        true,

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
      kind:
        "mallampati",

      title:
        "نمای Mallampati",

      shortTitle:
        "Mallampati",

      description:
        "تصویر روبرو با دهان کاملاً باز و زبان بیرون.",

      liveInstruction:
        "دهان کاملاً باز و زبان بیرون باشد؛ صورت روبه‌روی دوربین بماند.",

      guide:
        "mallampati",

      required:
        true,

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
      kind:
        "mouth_open",

      title:
        "نمای دهان باز",

      shortTitle:
        "دهان باز",

      description:
        "تصویر روبرو با دهان باز و زبان در وضعیت طبیعی.",

      liveInstruction:
        "دهان کاملاً باز باشد و زبان داخل دهان باقی بماند.",

      guide:
        "mouth-open",

      required:
        true,

      instructions: [
        "بیمار مستقیماً روبه‌روی دوربین قرار بگیرد.",
        "دهان کاملاً باز باشد.",
        "زبان بیرون آورده نشود.",
        "صورت در مرکز کادر باشد.",
        "داخل دهان واضح باشد.",
        "نور کافی وجود داشته باشد.",
        "تصویر تار نباشد.",
      ],
    },

    {
      kind:
        "upper_lip_bite_front",

      title:
        "نمای گاز گرفتن لب بالا",

      shortTitle:
        "گاز گرفتن لب بالا",

      description:
        "نمای روبرو در حالی که بیمار لب بالای خود را با دندان‌های پایین می‌گیرد.",

      liveInstruction:
        "بیمار لب بالا را با دندان‌های پایین بگیرد و صورت روبه‌روی دوربین باشد.",

      guide:
        "upper-lip-bite",

      required:
        true,

      instructions: [
        "بیمار مستقیماً روبه‌روی دوربین باشد.",
        "فک پایین را کمی جلو بیاورد.",
        "دندان‌های پایین روی لب بالا قرار بگیرند.",
        "ناحیه لب و دندان‌ها به‌وضوح دیده شود.",
        "صورت در مرکز کادر قرار داشته باشد.",
        "نور کافی باشد.",
        "تصویر تار نباشد.",
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

      liveInstruction:
        "صورت از کنار دیده شود و سر در وضعیت خنثی باشد.",

      guide:
        "lateral",

      required:
        true,

      instructions: [
        "صورت بیمار از نمای جانبی ثبت شود.",
        "سر در وضعیت طبیعی و خنثی قرار داشته باشد.",
        "چانه، فک و بخش قدامی گردن در تصویر دیده شوند.",
        "دوربین تا حد امکان هم‌سطح صورت باشد.",
        "نور یکنواخت باشد.",
        "تصویر تار نباشد.",
      ],
    },

    {
      kind:
        "head_back_side",

      title:
        "نمای جانبی — سر به عقب",

      shortTitle:
        "سر به عقب",

      description:
        "تصویر جانبی بیمار در حالی که سر به سمت عقب برده شده است.",

      liveInstruction:
        "نمای جانبی حفظ شود و بیمار سر خود را به سمت عقب ببرد.",

      guide:
        "head-back-side",

      required:
        true,

      instructions: [
        "بیمار در نمای جانبی قرار بگیرد.",
        "سر تا حد مناسب به سمت عقب برده شود.",
        "چانه و خط گردن داخل کادر باشند.",
        "حرکت سر باعث خروج صورت از کادر نشود.",
        "دوربین هم‌سطح صورت باقی بماند.",
        "نور کافی باشد.",
        "تصویر تار نباشد.",
      ],
    },
  ];
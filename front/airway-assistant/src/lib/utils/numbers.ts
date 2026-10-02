const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toEnglishDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => {
      return String(
        PERSIAN_DIGITS.indexOf(digit),
      );
    })
    .replace(/[٠-٩]/g, (digit) => {
      return String(
        ARABIC_DIGITS.indexOf(digit),
      );
    });
}

export function normalizeDecimalInput(
  value: string,
) {
  let normalized = toEnglishDigits(value)
    .replace(/٫/g, ".")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "");

  const firstDot =
    normalized.indexOf(".");

  if (firstDot !== -1) {
    normalized =
      normalized.slice(0, firstDot + 1) +
      normalized
        .slice(firstDot + 1)
        .replace(/\./g, "");
  }

  return normalized;
}

export function parseOptionalNumber(
  value: string,
): number | undefined {
  const normalized =
    normalizeDecimalInput(value);

  if (!normalized) {
    return undefined;
  }

  const result =
    Number(normalized);

  if (!Number.isFinite(result)) {
    return undefined;
  }

  return result;
}
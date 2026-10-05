export type QualityLevel =
  | "good"
  | "warning"
  | "bad";

export interface QualityCheck {
  key:
    | "lighting"
    | "sharpness"
    | "resolution";

  label: string;

  level: QualityLevel;

  detail: string;
}

export interface ImageQualityResult {
  overall: QualityLevel;

  brightness: number;

  sharpness: number;

  width: number;

  height: number;

  checks: QualityCheck[];
}

function getWorstLevel(
  levels: QualityLevel[],
): QualityLevel {
  if (
    levels.includes("bad")
  ) {
    return "bad";
  }

  if (
    levels.includes(
      "warning",
    )
  ) {
    return "warning";
  }

  return "good";
}

export function analyzeImageData(
  imageData: ImageData,
  sourceWidth: number,
  sourceHeight: number,
): ImageQualityResult {
  const {
    data,
    width,
    height,
  } = imageData;

  const pixelCount =
    width * height;

  const grayscale =
    new Float32Array(
      pixelCount,
    );

  let brightnessSum = 0;

  let veryDarkPixels = 0;

  let veryBrightPixels = 0;

  for (
    let index = 0;
    index < pixelCount;
    index += 1
  ) {
    const offset =
      index * 4;

    const red =
      data[offset];

    const green =
      data[offset + 1];

    const blue =
      data[offset + 2];

    const luminance =
      0.299 * red +
      0.587 * green +
      0.114 * blue;

    grayscale[index] =
      luminance;

    brightnessSum +=
      luminance;

    if (
      luminance < 20
    ) {
      veryDarkPixels += 1;
    }

    if (
      luminance > 235
    ) {
      veryBrightPixels +=
        1;
    }
  }

  const brightness =
    brightnessSum /
    pixelCount;

  const darkRatio =
    veryDarkPixels /
    pixelCount;

  const brightRatio =
    veryBrightPixels /
    pixelCount;

  let lightingLevel:
    QualityLevel;

  let lightingDetail:
    string;

  if (
    brightness < 40 ||
    darkRatio > 0.55
  ) {
    lightingLevel = "bad";

    lightingDetail =
      "تصویر خیلی تاریک است.";
  } else if (
    brightness > 220 ||
    brightRatio > 0.55
  ) {
    lightingLevel = "bad";

    lightingDetail =
      "تصویر بیش از حد روشن است.";
  } else if (
    brightness < 70 ||
    darkRatio > 0.3
  ) {
    lightingLevel =
      "warning";

    lightingDetail =
      "نور تصویر کم است.";
  } else if (
    brightness > 200 ||
    brightRatio > 0.3
  ) {
    lightingLevel =
      "warning";

    lightingDetail =
      "نور تصویر زیاد است.";
  } else {
    lightingLevel =
      "good";

    lightingDetail =
      "نور تصویر مناسب است.";
  }

  let laplacianSum = 0;

  let laplacianSquaredSum =
    0;

  let laplacianCount = 0;

  for (
    let y = 1;
    y < height - 1;
    y += 1
  ) {
    for (
      let x = 1;
      x < width - 1;
      x += 1
    ) {
      const index =
        y * width + x;

      const center =
        grayscale[index];

      const left =
        grayscale[index - 1];

      const right =
        grayscale[index + 1];

      const top =
        grayscale[
          index - width
        ];

      const bottom =
        grayscale[
          index + width
        ];

      const laplacian =
        4 * center -
        left -
        right -
        top -
        bottom;

      laplacianSum +=
        laplacian;

      laplacianSquaredSum +=
        laplacian *
        laplacian;

      laplacianCount += 1;
    }
  }

  const mean =
    laplacianCount
      ? laplacianSum /
        laplacianCount
      : 0;

  const sharpness =
    laplacianCount
      ? laplacianSquaredSum /
          laplacianCount -
        mean * mean
      : 0;

  let sharpnessLevel:
    QualityLevel;

  let sharpnessDetail:
    string;

  if (
    sharpness < 25
  ) {
    sharpnessLevel =
      "bad";

    sharpnessDetail =
      "تصویر تار است.";
  } else if (
    sharpness < 65
  ) {
    sharpnessLevel =
      "warning";

    sharpnessDetail =
      "وضوح تصویر متوسط است.";
  } else {
    sharpnessLevel =
      "good";

    sharpnessDetail =
      "وضوح تصویر مناسب است.";
  }

  const minimumDimension =
    Math.min(
      sourceWidth,
      sourceHeight,
    );

  let resolutionLevel:
    QualityLevel;

  let resolutionDetail:
    string;

  if (
    minimumDimension < 480
  ) {
    resolutionLevel =
      "bad";

    resolutionDetail =
      "رزولوشن تصویر پایین است.";
  } else if (
    minimumDimension < 720
  ) {
    resolutionLevel =
      "warning";

    resolutionDetail =
      "رزولوشن تصویر متوسط است.";
  } else {
    resolutionLevel =
      "good";

    resolutionDetail =
      "رزولوشن تصویر مناسب است.";
  }

  const checks:
    QualityCheck[] = [
      {
        key:
          "lighting",

        label: "نور",

        level:
          lightingLevel,

        detail:
          lightingDetail,
      },

      {
        key:
          "sharpness",

        label: "وضوح",

        level:
          sharpnessLevel,

        detail:
          sharpnessDetail,
      },

      {
        key:
          "resolution",

        label:
          "رزولوشن",

        level:
          resolutionLevel,

        detail:
          resolutionDetail,
      },
    ];

  return {
    overall:
      getWorstLevel(
        checks.map(
          (check) =>
            check.level,
        ),
      ),

    brightness:
      Math.round(
        brightness,
      ),

    sharpness:
      Math.round(
        sharpness,
      ),

    width:
      sourceWidth,

    height:
      sourceHeight,

    checks,
  };
}
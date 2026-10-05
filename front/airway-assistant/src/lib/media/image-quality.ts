import type {
  CaptureSource,
  ImageQualityFlag,
  ImageQualityMetrics,
} from "@/lib/domain/types";

const MAX_IMAGE_EDGE = 1920;

const JPEG_QUALITY = 0.9;

const QC_SAMPLE_SIZE = 96;



const MIN_SHORT_EDGE = 720;

const MIN_LUMINANCE = 35;

const MAX_LUMINANCE = 225;

const MIN_SHARPNESS_SCORE = 45;

export interface PreparedImage {
  file: File;

  source: CaptureSource;

  qc: ImageQualityMetrics;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                "IMAGE_ENCODING_FAILED",
              ),
            );

            return;
          }

          resolve(blob);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    },
  );
}

function getLuminance(
  r: number,
  g: number,
  b: number,
) {
  return (
    0.2126 * r +
    0.7152 * g +
    0.0722 * b
  );
}

function calculateImageMetrics(
  canvas: HTMLCanvasElement,
): {
  meanLuminance: number;
  sharpnessScore: number;
} {
  const sampleCanvas =
    document.createElement(
      "canvas",
    );

  sampleCanvas.width =
    QC_SAMPLE_SIZE;

  sampleCanvas.height =
    QC_SAMPLE_SIZE;

  const context =
    sampleCanvas.getContext(
      "2d",
      {
        willReadFrequently: true,
      },
    );

  if (!context) {
    throw new Error(
      "CANVAS_CONTEXT_UNAVAILABLE",
    );
  }

  context.drawImage(
    canvas,
    0,
    0,
    QC_SAMPLE_SIZE,
    QC_SAMPLE_SIZE,
  );

  const imageData =
    context.getImageData(
      0,
      0,
      QC_SAMPLE_SIZE,
      QC_SAMPLE_SIZE,
    );

  const pixelCount =
    QC_SAMPLE_SIZE *
    QC_SAMPLE_SIZE;

  const gray =
    new Float32Array(
      pixelCount,
    );

  let luminanceSum = 0;

  for (
    let pixel = 0;
    pixel < pixelCount;
    pixel += 1
  ) {
    const offset =
      pixel * 4;

    const luminance =
      getLuminance(
        imageData.data[
          offset
        ],
        imageData.data[
          offset + 1
        ],
        imageData.data[
          offset + 2
        ],
      );

    gray[pixel] =
      luminance;

    luminanceSum +=
      luminance;
  }

  const laplacianValues: number[] =
    [];

  for (
    let y = 1;
    y <
    QC_SAMPLE_SIZE - 1;
    y += 1
  ) {
    for (
      let x = 1;
      x <
      QC_SAMPLE_SIZE - 1;
      x += 1
    ) {
      const centerIndex =
        y * QC_SAMPLE_SIZE +
        x;

      const center =
        gray[centerIndex];

      const left =
        gray[
          centerIndex - 1
        ];

      const right =
        gray[
          centerIndex + 1
        ];

      const top =
        gray[
          centerIndex -
            QC_SAMPLE_SIZE
        ];

      const bottom =
        gray[
          centerIndex +
            QC_SAMPLE_SIZE
        ];

      const laplacian =
        left +
        right +
        top +
        bottom -
        4 * center;

      laplacianValues.push(
        laplacian,
      );
    }
  }

  const laplacianMean =
    laplacianValues.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    laplacianValues.length;

  const sharpnessScore =
    laplacianValues.reduce(
      (sum, value) => {
        const difference =
          value -
          laplacianMean;

        return (
          sum +
          difference *
            difference
        );
      },
      0,
    ) /
    laplacianValues.length;

  return {
    meanLuminance:
      luminanceSum /
      pixelCount,

    sharpnessScore,
  };
}

export async function prepareImageForStorage(
  inputFile: File,
  source: CaptureSource,
): Promise<PreparedImage> {
  const bitmap =
    await createImageBitmap(
      inputFile,
    );

  try {
    const originalWidth =
      bitmap.width;

    const originalHeight =
      bitmap.height;

    if (
      !originalWidth ||
      !originalHeight
    ) {
      throw new Error(
        "INVALID_IMAGE_DIMENSIONS",
      );
    }

    const longestEdge =
      Math.max(
        originalWidth,
        originalHeight,
      );

    const resizeScale =
      longestEdge >
      MAX_IMAGE_EDGE
        ? MAX_IMAGE_EDGE /
          longestEdge
        : 1;

    const width =
      Math.max(
        1,
        Math.round(
          originalWidth *
            resizeScale,
        ),
      );

    const height =
      Math.max(
        1,
        Math.round(
          originalHeight *
            resizeScale,
        ),
      );

    const canvas =
      document.createElement(
        "canvas",
      );

    canvas.width = width;

    canvas.height = height;

    const context =
      canvas.getContext(
        "2d",
      );

    if (!context) {
      throw new Error(
        "CANVAS_CONTEXT_UNAVAILABLE",
      );
    }

    context.drawImage(
      bitmap,
      0,
      0,
      width,
      height,
    );

    const {
      meanLuminance,
      sharpnessScore,
    } =
      calculateImageMetrics(
        canvas,
      );

    const flags:
      ImageQualityFlag[] =
        [];

    if (
      Math.min(
        width,
        height,
      ) < MIN_SHORT_EDGE
    ) {
      flags.push(
        "low_resolution",
      );
    }

    if (
      meanLuminance <
      MIN_LUMINANCE
    ) {
      flags.push(
        "too_dark",
      );
    }

    if (
      meanLuminance >
      MAX_LUMINANCE
    ) {
      flags.push(
        "too_bright",
      );
    }

    if (
      sharpnessScore <
      MIN_SHARPNESS_SCORE
    ) {
      flags.push(
        "possibly_blurry",
      );
    }

    const blob =
      await canvasToBlob(
        canvas,
      );

    const normalizedFile =
      new File(
        [blob],
        `airway-${Date.now()}.jpg`,
        {
          type:
            "image/jpeg",

          lastModified:
            Date.now(),
        },
      );

    return {
      file: normalizedFile,

      source,

      qc: {
        width,

        height,

        meanLuminance:
          Number(
            meanLuminance.toFixed(
              2,
            ),
          ),

        sharpnessScore:
          Number(
            sharpnessScore.toFixed(
              2,
            ),
          ),

        flags,

        status:
          flags.length === 0
            ? "pass"
            : "review",
      },
    };
  } finally {
    bitmap.close();
  }
}

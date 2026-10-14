"""Decode uploads and produce real, optimized JPEGs before storage."""

import io
import warnings

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError


def normalize_photo(upload):
    try:
        upload.seek(0)
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(upload) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValidationError("Use a JPEG, PNG, or WebP image.")
                if getattr(source, "n_frames", 1) != 1:
                    raise ValidationError("Animated or multi-frame images are not supported.")
                if source.width * source.height > settings.PHOTO_MAX_PIXELS:
                    raise ValidationError("Image resolution exceeds the configured pixel limit.")
                if source.mode in {"I", "F"} or source.mode.startswith("I;16"):
                    raise ValidationError("Use an 8-bit photo; high bit-depth images need a lossless workflow.")

                # Apply phone orientation to pixels before dropping EXIF metadata.
                oriented = ImageOps.exif_transpose(source)
                icc_profile = source.info.get("icc_profile")
                if icc_profile and oriented.mode in {"CMYK", "L"}:
                    target = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
                    rgb = ImageCms.profileToProfile(
                        oriented, ImageCms.ImageCmsProfile(io.BytesIO(icc_profile)),
                        target, outputMode="RGB",
                    )
                    icc_profile = target.tobytes()
                elif "A" in oriented.getbands() or "transparency" in oriented.info:
                    rgba = oriented.convert("RGBA")
                    rgb = Image.new("RGB", rgba.size, "white")
                    rgb.paste(rgba, mask=rgba.getchannel("A"))
                else:
                    rgb = oriented.convert("RGB")

                output = io.BytesIO()
                rgb.save(
                    output,
                    format="JPEG",
                    quality=settings.PHOTO_JPEG_QUALITY,
                    subsampling=0,
                    # Baseline encoding avoids libjpeg buffer failures on high-detail
                    # 4:4:4 photos, while still compressing at the configured quality.
                    optimize=False,
                    progressive=False,
                    icc_profile=icc_profile,
                )
        return SimpleUploadedFile("photo.jpg", output.getvalue(), content_type="image/jpeg")
    except (UnidentifiedImageError, OSError, ValueError, ImageCms.PyCMSError,
            Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValidationError("The image is invalid, damaged, or too large to decode safely.") from exc
    finally:
        upload.seek(0)

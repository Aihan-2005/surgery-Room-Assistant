from pathlib import Path
from datetime import datetime
import shutil


ROOT = Path(__file__).resolve().parent

original: dict[Path, str] = {}
changed: dict[Path, str] = {}


def load(path: str) -> Path:
    file = ROOT / path

    if not file.is_file():
        raise RuntimeError(
            f"File not found: {path}. "
            "Put this script beside package.json."
        )

    if file not in original:
        original[file] = file.read_text(
            encoding="utf-8"
        )
        changed[file] = original[file]

    return file


def replace_once(
    path: str,
    old: str,
    new: str,
) -> None:
    file = load(path)

    count = changed[file].count(old)

    if count != 1:
        raise RuntimeError(
            f"Expected exactly one match in {path}, "
            f"found {count}. "
            "No files have been changed. "
            "Please check your local code."
        )

    changed[file] = changed[file].replace(
        old,
        new,
        1,
    )


# --------------------------------------------------------
# 1. Capture page: initial IndexedDB loading
# --------------------------------------------------------

capture = (
    "src/app/cases/[caseId]/capture/page.tsx"
)

replace_once(
    capture,
    """  useEffect(() => {
    void loadData();
  }, [
    loadData,
  ]);""",
    """  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(initialLoadId);
  }, [
    loadData,
  ]);""",
)


# --------------------------------------------------------
# 2. Capture page: object URL cleanup warning
# --------------------------------------------------------

replace_once(
    capture,
    """  useEffect(() => {
    return () => {
      for (
        const url of
        previewUrlsRef.current
      ) {
        URL.revokeObjectURL(
          url,
        );
      }

      previewUrlsRef.current.clear();
    };
  }, []);""",
    """  useEffect(() => {
    const previewUrls = previewUrlsRef.current;

    return () => {
      for (const url of previewUrls) {
        URL.revokeObjectURL(url);
      }

      previewUrls.clear();
    };
  }, []);""",
)


# --------------------------------------------------------
# 3. Capture page: preserve offline navigation
# --------------------------------------------------------

replace_once(
    capture,
    """            window.location.assign(
              "/queue",
            )""",
    """            // Full page navigation is intentional for the offline PWA shell.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign(
              "/queue",
            )""",
)


# --------------------------------------------------------
# 4. Cases listing: initial loading
# --------------------------------------------------------

cases = "src/app/cases/page.tsx"

replace_once(
    cases,
    """  useEffect(() => {
    void loadCases();

    const handleFocus = () => {""",
    """  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadCases();
    }, 0);

    const handleFocus = () => {""",
)

replace_once(
    cases,
    """    return () => {
      window.removeEventListener("focus", handleFocus);
    };""",
    """    return () => {
      window.clearTimeout(initialLoadId);
      window.removeEventListener("focus", handleFocus);
    };""",
)


# --------------------------------------------------------
# 5. Home page: initial loading
# --------------------------------------------------------

home = "src/app/page.tsx"

replace_once(
    home,
    """  useEffect(() => {
    void loadCases();

    const handleFocus =""",
    """  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadCases();
    }, 0);

    const handleFocus =""",
)

replace_once(
    home,
    """    return () => {
      window.removeEventListener(
        "focus",
        handleFocus,
      );""",
    """    return () => {
      window.clearTimeout(initialLoadId);
      window.removeEventListener(
        "focus",
        handleFocus,
      );""",
)


# --------------------------------------------------------
# 6. Queue page: initial loading
# --------------------------------------------------------

queue = "src/app/queue/page.tsx"

replace_once(
    queue,
    """  useEffect(() => {
    void loadQueue(
      true,
    );""",
    """  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadQueue(true);
    }, 0);""",
)

replace_once(
    queue,
    """    return () => {
      window.clearInterval(
        intervalId,
      );""",
    """    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(
        intervalId,
      );""",
)


# --------------------------------------------------------
# 7. OperatorGate: initial doctor profile reading
# --------------------------------------------------------

gate = (
    "src/components/app-shell/operator-gate.tsx"
)

replace_once(
    gate,
    """  useEffect(() => {
    const profile =
      getOperatorProfile();

    setState(
      profile
        ? "ready"
        : "setup",
    );
  }, []);""",
    """  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      const profile = getOperatorProfile();
      setState(profile ? "ready" : "setup");
    }, 0);

    return () => window.clearTimeout(initialLoadId);
  }, []);""",
)


# --------------------------------------------------------
# 8. GuidedCamera: initial camera activation
# --------------------------------------------------------

camera = (
    "src/components/capture/guided-camera.tsx"
)

replace_once(
    camera,
    """  useEffect(() => {
    if (supportsLiveCamera) {
      void startLiveCamera();
    } else {
      setStatus("fallback");
      setMessage(
        "روی HTTP، مرورگر اجازه دوربین زنده داخل برنامه نمی‌دهد. " +
          "از دکمه گرفتن عکس با دوربین گوشی استفاده کنید.",
      );
    }

    return () => stopCamera();
  }, [""",
    """  useEffect(() => {
    const initialCameraId = window.setTimeout(() => {
      if (supportsLiveCamera) {
        void startLiveCamera();
      } else {
        setStatus("fallback");
        setMessage(
          "روی HTTP، مرورگر اجازه دوربین زنده داخل برنامه نمی‌دهد. " +
            "از دکمه گرفتن عکس با دوربین گوشی استفاده کنید.",
        );
      }
    }, 0);

    return () => {
      window.clearTimeout(initialCameraId);
      stopCamera();
    };
  }, [""",
)


# --------------------------------------------------------
# 9. QualityFeedback: static icons for React
# --------------------------------------------------------

quality = (
    "src/components/capture/quality-feedback.tsx"
)

replace_once(
    quality,
    """function getIcon(
  level: QualityLevel,
) {
  switch (level) {
    case "good":
      return CheckCircle2;

    case "warning":
      return AlertTriangle;

    case "bad":
      return XCircle;
  }
}""",
    """function QualityIcon({
  level,
  size,
  className,
}: {
  level: QualityLevel;
  size: number;
  className?: string;
}) {
  switch (level) {
    case "good":
      return <CheckCircle2 size={size} className={className} />;

    case "warning":
      return <AlertTriangle size={size} className={className} />;

    case "bad":
      return <XCircle size={size} className={className} />;

    default:
      return <CircleEllipsis size={size} className={className} />;
  }
}""",
)

replace_once(
    quality,
    """    const Icon =
      getIcon(
        quality.overall,
      );
""",
    "",
)

replace_once(
    quality,
    """        <Icon
          size={15}
          className={
            config.icon
          }
        />""",
    """        <QualityIcon
          level={quality.overall}
          size={15}
          className={config.icon}
        />""",
)

replace_once(
    quality,
    """            const Icon =
              getIcon(
                check.level,
              );
""",
    "",
)

replace_once(
    quality,
    """                <Icon
                  size={16}
                  className={`
                    mx-auto
                    ${config.icon}
                  `}
                />""",
    """                <QualityIcon
                  level={check.level}
                  size={16}
                  className={`mx-auto ${config.icon}`}
                />""",
)


# --------------------------------------------------------
# 10. Old notification component:
#     reuse the main PWA implementation
# --------------------------------------------------------

old_notifications = (
    "src/components/sync/sync-reminder-permission.tsx"
)

file = load(old_notifications)

if (
    "export function SyncReminderPermission()"
    not in changed[file]
):
    raise RuntimeError(
        "Expected old notification component in "
        f"{old_notifications}. "
        "No files have been changed."
    )

changed[file] = """export {
  SyncReminderPermission,
} from "@/components/pwa/sync-reminder-permission";
"""


# --------------------------------------------------------
# 11. Operator profile: unused compatibility option
# --------------------------------------------------------

profile = (
    "src/lib/profile/operator-profile.ts"
)

replace_once(
    profile,
    """  _options?: {
    force?: boolean;
  },
): Promise<OperatorProfile> {
  let profile =""",
    """  _options?: {
    force?: boolean;
  },
): Promise<OperatorProfile> {
  // Keep compatibility without resetting the Device UUID.
  void _options;

  let profile =""",
)


# --------------------------------------------------------
# 12. New Case: preserve full offline navigation
# --------------------------------------------------------

new_case = "src/app/cases/new/page.tsx"

replace_once(
    new_case,
    """      window.location.assign(
        `/capture?caseId=${encodeURIComponent(airwayCase.id)}`,
      );""",
    """      // Full navigation is intentional: /capture is cached by the PWA.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/capture?caseId=${encodeURIComponent(airwayCase.id)}`,
      );""",
)


# --------------------------------------------------------
# Validate everything before writing.
# Make source backups, then apply changes.
# --------------------------------------------------------

changed_files = [
    (path, content)
    for path, content in changed.items()
    if content != original[path]
]

backup = (
    ROOT
    / ".lint-fix-backups"
    / datetime.now().strftime(
        "%Y%m%d-%H%M%S"
    )
)

for path, content in changed_files:
    relative = path.relative_to(ROOT)

    target = backup / (
        str(relative) + ".bak"
    )

    target.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    shutil.copy2(
        path,
        target,
    )


for path, content in changed_files:
    path.write_text(
        content,
        encoding="utf-8",
    )


print(
    f"Updated {len(changed_files)} files successfully."
)

print(
    "Original source backups: "
    f"{backup.relative_to(ROOT)}"
)

print(
    "Next: npm run lint && "
    "npx tsc --noEmit && npm run build"
)

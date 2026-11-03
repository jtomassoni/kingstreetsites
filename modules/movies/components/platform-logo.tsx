import {
  normalizeWatchPlatform,
  watchPlatformLabel,
  type WatchPlatformId,
} from "@movies/lib/platforms";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = {
  sm: 22,
  md: 28,
  lg: 36,
};

/** Brand tile colors — recognizable at a glance on the calendar. */
const BRAND: Record<
  WatchPlatformId,
  { bg: string; fg: string }
> = {
  max: { bg: "#002BE7", fg: "#FFFFFF" },
  netflix: { bg: "#141414", fg: "#E50914" },
  disney_plus: { bg: "#040714", fg: "#FFFFFF" },
  prime: { bg: "#0F171E", fg: "#00A8E1" },
  peacock: { bg: "#000000", fg: "#FDB927" },
  paramount_plus: { bg: "#0064FF", fg: "#FFFFFF" },
  apple_tv: { bg: "#000000", fg: "#FFFFFF" },
  youtube_tv: { bg: "#FF0000", fg: "#FFFFFF" },
  cable: { bg: "#2A2A2A", fg: "#F5F5F5" },
  other: { bg: "#5C5C5C", fg: "#FFFFFF" },
};

function Mark({
  platform,
  className,
}: {
  platform: WatchPlatformId;
  className?: string;
}) {
  switch (platform) {
    case "max":
      return (
        <svg viewBox="0 0 40 16" className={className} aria-hidden>
          <text
            x="20"
            y="12.5"
            textAnchor="middle"
            fill="currentColor"
            style={{
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            max
          </text>
        </svg>
      );
    case "netflix":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path
            fill="currentColor"
            d="M5.5 2h4.2l4.6 14.2V2H19v20h-4.3L10.1 7.8V22H5.5V2z"
          />
        </svg>
      );
    case "disney_plus":
      return (
        <svg viewBox="0 0 56 16" className={className} aria-hidden>
          <text
            x="28"
            y="12"
            textAnchor="middle"
            fill="currentColor"
            style={{
              fontFamily:
                'ui-serif, Georgia, "Times New Roman", serif',
              fontSize: 11,
              fontWeight: 600,
              fontStyle: "italic",
              letterSpacing: "-0.02em",
            }}
          >
            disney+
          </text>
        </svg>
      );
    case "prime":
      return (
        <svg viewBox="0 0 48 16" className={className} aria-hidden>
          <text
            x="24"
            y="11.5"
            textAnchor="middle"
            fill="currentColor"
            style={{
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            prime
          </text>
        </svg>
      );
    case "peacock":
      return (
        <svg viewBox="0 0 56 16" className={className} aria-hidden>
          <text
            x="28"
            y="12"
            textAnchor="middle"
            fill="currentColor"
            style={{
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.02em",
            }}
          >
            peacock
          </text>
        </svg>
      );
    case "paramount_plus":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path
            fill="currentColor"
            d="M12 2.2 13.2 6l.4 1.3H20l-1.1.8-3.2 2.3 1.2 3.8-3.3-2.4L12 13.2l-1.6 1.3-3.3 2.4 1.2-3.8L5.1 8.1 4 7.3h6.4L12 2.2z"
          />
          <text
            x="12"
            y="21"
            textAnchor="middle"
            fill="currentColor"
            style={{
              fontFamily:
                'ui-sans-serif, system-ui, sans-serif',
              fontSize: 7,
              fontWeight: 800,
            }}
          >
            +
          </text>
        </svg>
      );
    case "apple_tv":
      return (
        <svg viewBox="0 0 40 16" className={className} aria-hidden>
          <text
            x="20"
            y="12"
            textAnchor="middle"
            fill="currentColor"
            style={{
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            tv+
          </text>
        </svg>
      );
    case "youtube_tv":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path
            fill="currentColor"
            d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15.2V8.8L15.5 12 10 15.2z"
          />
        </svg>
      );
    case "cable":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path
            fill="currentColor"
            d="M4 6h16v10H4V6zm2 2v6h12V8H6zm4 11h4v1.5h-4V19z"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.9" />
        </svg>
      );
  }
}

export function PlatformLogo({
  platform,
  size = "md",
  className = "",
  title,
}: {
  platform: string | null | undefined;
  size?: Size;
  className?: string;
  title?: string;
}) {
  const id = normalizeWatchPlatform(platform);
  if (!id) return null;
  const brand = BRAND[id];
  const px = SIZE_PX[size];
  const label = title ?? watchPlatformLabel(id) ?? id;
  const wide =
    id === "disney_plus" ||
    id === "peacock" ||
    id === "prime" ||
    id === "max" ||
    id === "apple_tv";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md ${className}`}
      style={{
        width: wide ? Math.round(px * 1.55) : px,
        height: px,
        backgroundColor: brand.bg,
        color: brand.fg,
      }}
      title={label}
      aria-label={label}
    >
      <Mark
        platform={id}
        className={wide ? "h-[55%] w-[85%]" : "h-[62%] w-[62%]"}
      />
    </span>
  );
}

export function PlatformPickerButton({
  platform,
  selected,
  onClick,
}: {
  platform: WatchPlatformId;
  selected: boolean;
  onClick: () => void;
}) {
  const label = watchPlatformLabel(platform) ?? platform;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
        selected
          ? "border-brand/40 bg-brand/10 text-brand-dark ring-2 ring-brand/25"
          : "border-ink/10 bg-cream text-ink-muted hover:bg-cream-dark"
      }`}
    >
      <PlatformLogo platform={platform} size="sm" />
      <span>{label}</span>
    </button>
  );
}

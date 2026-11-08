import type { ToolDefinition } from "@/lib/tools/registry";

const stroke = 1.75;

export function ToolIcon({
  name,
  className,
}: {
  name: ToolDefinition["icon"];
  className?: string;
}) {
  const props = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "UtensilsCrossed":
      return (
        <svg {...props}>
          <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8" />
          <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7" />
          <path d="m2.1 21.8 6.4-6.3" />
          <path d="m19 5-7 7" />
        </svg>
      );
    case "Clapperboard":
      return (
        <svg {...props}>
          <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
          <path d="m6.2 5.3 3.1 3.9" />
          <path d="m12.4 3.4 3.1 4" />
          <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      );
    case "ListTodo":
      return (
        <svg {...props}>
          <path d="M13 5h8" />
          <path d="M13 12h8" />
          <path d="M13 19h8" />
          <path d="m3 17 2 2 4-4" />
          <path d="m3 7 2 2 4-4" />
        </svg>
      );
    case "PackageSearch":
      return (
        <svg {...props}>
          <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
          <path d="m7.5 4.27 9 5.15" />
          <path d="M3.29 7 12 12l8.71-5" />
          <path d="M12 22V12" />
          <circle cx="18.5" cy="15.5" r="2.5" />
          <path d="M20.27 17.27 22 19" />
        </svg>
      );
    case "Gamepad2":
      return (
        <svg {...props}>
          <path d="M6 11h4" />
          <path d="M8 9v4" />
          <path d="M15 12h.01" />
          <path d="M18 10h.01" />
          <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5Z" />
        </svg>
      );
    default:
      return null;
  }
}

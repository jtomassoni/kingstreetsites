import { ImageResponse } from "next/og";
import React from "react";
import { APP_SHORT_NAME } from "@meals/lib/brand";

export const BRAND_ICON_BG = "#285a42";
export const BRAND_ICON_FG = "#eef6f1";

async function loadDisplayFont(weight: 600): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Literata:wght@${weight}&display=swap`;
    const css = await (await fetch(cssUrl)).text();
    const match = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
    if (!match?.[1]) return null;
    const res = await fetch(match[1]);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

type BrandIconVariant = "app" | "maskable";

function BrandIconMark({
  size,
  variant,
  fontFamily,
}: {
  size: number;
  variant: BrandIconVariant;
  fontFamily: string;
}) {
  const letter = APP_SHORT_NAME.charAt(0);
  const fontSize = Math.round(size * (variant === "maskable" ? 0.42 : 0.5));
  const badgeSize = Math.round(size * 0.68);
  const badgeRadius = Math.round(badgeSize * 0.28);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          variant === "maskable"
            ? BRAND_ICON_BG
            : "linear-gradient(145deg, #2f6b4f 0%, #285a42 52%, #234d3a 100%)",
      }}
    >
      {variant === "maskable" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND_ICON_FG,
            fontSize,
            fontFamily,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {letter}
        </div>
      ) : (
        <div
          style={{
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeRadius,
            background: "rgba(21, 32, 25, 0.14)",
            boxShadow: "inset 0 1px 0 rgba(238, 246, 241, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND_ICON_FG,
            fontSize,
            fontFamily,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {letter}
        </div>
      )}
    </div>
  );
}

export async function createBrandIconImageResponse(
  size: number,
  variant: BrandIconVariant = "app",
) {
  const displayFont = await loadDisplayFont(600);
  const fontFamily = displayFont ? "Literata" : "Georgia, serif";
  const fonts = displayFont
    ? [{ name: "Literata", data: displayFont, weight: 600 as const, style: "normal" as const }]
    : undefined;

  return new ImageResponse(
    <BrandIconMark size={size} variant={variant} fontFamily={fontFamily} />,
    {
      width: size,
      height: size,
      fonts,
    },
  );
}

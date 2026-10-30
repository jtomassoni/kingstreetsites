/** Decorative kitchen scene for the Ideas hero. */
export function IdeasHeroArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 160 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="ideas-plate" x1="30" y1="70" x2="130" y2="120">
          <stop stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="ideas-bowl" x1="50" y1="55" x2="110" y2="95">
          <stop stopColor="var(--primary)" stopOpacity="0.55" />
          <stop
            offset="1"
            stopColor="var(--meal-dinner-rail)"
            stopOpacity="0.4"
          />
        </linearGradient>
      </defs>

      <circle
        cx="42"
        cy="38"
        r="22"
        fill="var(--meal-breakfast-rail)"
        fillOpacity="0.18"
      />
      <circle cx="122" cy="32" r="18" fill="var(--primary)" fillOpacity="0.16" />
      <circle
        cx="128"
        cy="98"
        r="26"
        fill="var(--meal-lunch-rail)"
        fillOpacity="0.14"
      />

      <ellipse cx="80" cy="102" rx="52" ry="14" fill="url(#ideas-plate)" />
      <ellipse
        cx="80"
        cy="100"
        rx="52"
        ry="14"
        stroke="var(--primary)"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <ellipse
        cx="80"
        cy="96"
        rx="34"
        ry="8"
        fill="var(--card)"
        fillOpacity="0.35"
        stroke="var(--primary)"
        strokeOpacity="0.25"
        strokeWidth="1.25"
      />

      <path
        d="M48 78c3 16 14 26 32 26s29-10 32-26"
        fill="url(#ideas-bowl)"
      />
      <path
        d="M48 78c3 16 14 26 32 26s29-10 32-26"
        stroke="var(--primary)"
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="80"
        cy="76"
        rx="32"
        ry="7"
        fill="var(--primary)"
        fillOpacity="0.28"
        stroke="var(--primary)"
        strokeOpacity="0.4"
        strokeWidth="1.25"
      />

      <circle
        cx="68"
        cy="76"
        r="4.5"
        fill="var(--meal-breakfast-rail)"
        fillOpacity="0.75"
      />
      <circle
        cx="80"
        cy="74"
        r="5"
        fill="var(--meal-lunch-rail)"
        fillOpacity="0.7"
      />
      <circle
        cx="92"
        cy="77"
        r="4"
        fill="var(--meal-dinner-rail)"
        fillOpacity="0.7"
      />
      <path
        d="M74 80c3 2 8 2 11 0"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.35"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      <path
        className="ideas-steam"
        d="M66 62c1-7 5-10 4-16"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
      <path
        className="ideas-steam ideas-steam-b"
        d="M80 58c1-8 6-11 5-18"
        stroke="var(--primary)"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
      <path
        className="ideas-steam ideas-steam-c"
        d="M94 62c1-7 4-10 3-15"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />

      <g
        stroke="var(--primary)"
        strokeOpacity="0.55"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <path d="M28 48v22" />
        <path d="M24 48v10c0 2.5 1.8 4 4 4s4-1.5 4-4V48" />
        <path d="M28 76v18" />
      </g>

      <g
        stroke="var(--primary)"
        strokeOpacity="0.5"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <ellipse
          cx="132"
          cy="56"
          rx="7"
          ry="9"
          fill="var(--primary)"
          fillOpacity="0.12"
        />
        <path d="M132 65v28" />
      </g>

      <path
        className="ideas-spark"
        d="M118 24l1.8 4.1 4.1 1.8-4.1 1.8L118 35.8l-1.8-4.1-4.1-1.8 4.1-1.8L118 24z"
        fill="var(--meal-breakfast-rail)"
      />
      <path
        className="ideas-spark ideas-spark-b"
        d="M38 24l1.4 3.2 3.2 1.4-3.2 1.4L38 33.2l-1.4-3.2-3.2-1.4 3.2-1.4L38 24z"
        fill="var(--primary)"
      />
      <path
        className="ideas-spark ideas-spark-c"
        d="M108 48l1.1 2.5 2.5 1.1-2.5 1.1L108 55.2l-1.1-2.5-2.5-1.1 2.5-1.1L108 48z"
        fill="var(--meal-lunch-rail)"
      />
    </svg>
  );
}

export function IdeasEmptyArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="60" cy="48" r="34" fill="var(--primary)" fillOpacity="0.1" />
      <circle
        cx="34"
        cy="28"
        r="10"
        fill="var(--meal-breakfast-rail)"
        fillOpacity="0.22"
      />
      <circle
        cx="92"
        cy="70"
        r="12"
        fill="var(--meal-lunch-rail)"
        fillOpacity="0.18"
      />
      <path
        d="M60 18c-12 0-22 9-22 21 0 7.4 3.8 13.8 9.6 17.6V66h24.8v-9.4C78.2 52.8 82 46.4 82 39c0-12-10-21-22-21z"
        fill="var(--primary)"
        fillOpacity="0.22"
        stroke="var(--primary)"
        strokeOpacity="0.65"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M50 66h20M52.5 72h15M55 78h10"
        stroke="var(--primary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
      <path
        className="ideas-spark"
        d="M92 22l1.5 3.4 3.4 1.5-3.4 1.5L92 31.8l-1.5-3.4-3.4-1.5 3.4-1.5L92 22z"
        fill="var(--meal-breakfast-rail)"
      />
      <path
        className="ideas-spark ideas-spark-b"
        d="M28 40l1.2 2.7 2.7 1.2-2.7 1.2L28 47.8l-1.2-2.7-2.7-1.2 2.7-1.2L28 40z"
        fill="var(--primary)"
      />
    </svg>
  );
}

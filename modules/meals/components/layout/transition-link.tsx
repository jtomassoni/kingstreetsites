"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import {
  setTransitionIntent,
  type TransitionIntent,
} from "@meals/lib/navigation/transition-intent";

type Props = ComponentProps<typeof Link> & {
  transition?: TransitionIntent;
};

export function TransitionLink({
  transition = "fade",
  onClick,
  ...props
}: Props) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0
        ) {
          setTransitionIntent(transition);
        }
        onClick?.(event);
      }}
    />
  );
}

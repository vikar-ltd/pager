import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A page section. The visual language: hairline top rule + tiny mono eyebrow
 * label + optional right-side controls, then the content. Used in place of
 * Cards so pages read like a document, not a stack of boxes.
 */
export function Section({
  label,
  aside,
  children,
  className,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rule-top", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-3 pt-4 pb-5">
        <div className="eyebrow">{label}</div>
        {aside ? <div className="flex items-baseline gap-3">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

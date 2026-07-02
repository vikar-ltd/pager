import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        // Baseline: no card frame; hairline underline instead.
        "block w-full bg-transparent border-b border-input px-0 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground/60",
        "transition-colors duration-150",
        "focus:outline-none focus:border-foreground",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };

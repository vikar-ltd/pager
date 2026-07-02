import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badges are now flat text with a hairline — treated as annotations, not chips.
const badgeVariants = cva(
  "inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-eyebrow px-1.5 py-0.5",
  {
    variants: {
      variant: {
        default: "text-foreground",
        moss: "text-moss",
        secondary: "text-muted-foreground",
        destructive: "text-destructive",
        outline: "text-muted-foreground border border-rule",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

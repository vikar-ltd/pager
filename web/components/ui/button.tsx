import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 focus-moss select-none",
  {
    variants: {
      variant: {
        // Ink-on-paper filled button
        default:
          "bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 active:bg-primary/95",
        // Moss accent for the strong yes
        moss:
          "bg-moss text-primary-foreground rounded-sm hover:brightness-110 active:brightness-95",
        destructive:
          "bg-destructive text-destructive-foreground rounded-sm hover:brightness-110",
        // A minimal button with just a hairline border
        outline:
          "border border-input bg-transparent rounded-sm hover:bg-accent hover:text-accent-foreground",
        // Text-only, underlines on hover — like a link
        ghost:
          "bg-transparent hover:text-foreground text-muted-foreground rounded-sm px-1 -mx-1 underline-offset-[3px] hover:underline decoration-1",
        link:
          "text-foreground underline-offset-[3px] underline decoration-1 hover:decoration-[hsl(var(--moss))]",
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-sm tracking-wide",
        icon: "h-8 w-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";
import { Check, Plus, Upload, X, Send } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#4a1111] text-white shadow-sm hover:bg-[#5a1717]",
        destructive:
          "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
        outline:
          "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
        secondary:
          "bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200",
        ghost: "text-slate-700 hover:bg-slate-100",
        link: "text-[#4a1111] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-lg px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, icon: Icon, iconPosition = "start", children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}>
        {Icon && iconPosition === "start" && <Icon className="h-4 w-4" />}
        {children}
        {Icon && iconPosition === "end" && <Icon className="h-4 w-4" />}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

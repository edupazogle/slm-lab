// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/ui/button.tsx (MIT, Copyright (c) 2025 LocalMode).
// Changes: radix `Slot`/`asChild` removed (radix-ui is not a dependency here); wrapped in forwardRef for React 18;
// shadcn colour tokens and Tailwind-4-only utilities (shadow-xs, ring tokens) remapped to Tailwind 3 + the daisyUI
// carbon themes; 2px corners per the form identity; the focus ring is left to tokens.css (:focus-visible outline).
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-form text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-content hover:bg-primary/90',
        destructive: 'bg-error text-base-100 hover:bg-error/90',
        outline:
          'border border-primary/50 bg-transparent text-primary hover:bg-primary/10',
        secondary: 'bg-base-300 text-base-content hover:bg-base-300/70',
        ghost: 'text-base-content hover:bg-base-content/10',
        link: 'text-primary underline underline-offset-4 hover:no-underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-9 gap-1.5 px-3',
        lg: 'h-11 px-6',
        icon: 'size-10',
        'icon-xs': "size-7 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-9',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>
>(function Button(
  { className, variant = 'default', size = 'default', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});

export { Button, buttonVariants };

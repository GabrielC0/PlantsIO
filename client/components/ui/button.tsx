import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

interface ButtonVariantProps {
  variant?: ButtonVariant | null
  size?: ButtonSize | null
  className?: string
}

function buttonVariants({ variant = 'default', size = 'default', className }: ButtonVariantProps = {}) {
  return ['btn', `btn--${variant ?? 'default'}`, size && size !== 'default' ? `btn--${size}` : '', className]
    .filter(Boolean)
    .join(' ')
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }

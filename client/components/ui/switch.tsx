'use client'

import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={['switch', className].filter(Boolean).join(' ')}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className="switch__thumb" />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }

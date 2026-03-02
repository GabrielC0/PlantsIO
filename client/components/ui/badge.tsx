import type * as React from 'react'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const classes = ['badge', `badge--${variant}`, className].filter(Boolean).join(' ')
  return <div className={classes} {...props} />
}

export { Badge }

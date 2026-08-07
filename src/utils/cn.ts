import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Same helper as proxyma-app's src/utils/cn.ts. clsx flattens the conditionals, twMerge
// resolves Tailwind collisions so a `className` passed by a caller actually wins over the
// component's own class rather than depending on stylesheet order.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

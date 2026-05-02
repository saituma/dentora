"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Appointment status badge component using CVA for type-safe variants.
 * Following shadcn/ui patterns with data-slot attributes.
 */
const appointmentBadgeVariants = cva(
  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
  {
    variants: {
      status: {
        scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        completed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
        cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        noshow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        rescheduled: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      },
    },
    defaultVariants: {
      status: "scheduled",
    },
  }
)

type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "noshow" | "rescheduled"

interface AppointmentBadgeProps extends React.ComponentProps<"div">, VariantProps<typeof appointmentBadgeVariants> {
  status: AppointmentStatus
  showIcon?: boolean
}

const statusIcons = {
  scheduled: "📅",
  confirmed: "✓",
  completed: "✓✓",
  cancelled: "✗",
  noshow: "⊘",
  rescheduled: "↻",
}

export function AppointmentBadge({ status, showIcon = true, className, ...props }: AppointmentBadgeProps) {
  return (
    <div
      data-slot="appointment-badge"
      data-status={status}
      className={cn(appointmentBadgeVariants({ status }), className)}
      {...props}
    >
      {showIcon && <span aria-hidden="true">{statusIcons[status]}</span>}
      <span className="capitalize">{status}</span>
    </div>
  )
}

export { appointmentBadgeVariants }
export type { AppointmentStatus }

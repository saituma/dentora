"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AppointmentBadge, type AppointmentStatus } from "./appointment-badge"
import { Calendar, Clock, User, Stethoscope } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Appointment card component - displays appointment details in a card layout.
 * Following shadcn/ui composition patterns.
 */
interface Appointment {
  id: string
  patientName: string
  dentist: string
  dateTime: Date
  status: AppointmentStatus
  notes?: string
  duration?: number // in minutes
}

interface AppointmentCardProps {
  appointment: Appointment
  onEdit?: (id: string) => void
  onCancel?: (id: string) => void
  onConfirm?: (id: string) => void
  className?: string
}

export function AppointmentCard({
  appointment,
  onEdit,
  onCancel,
  onConfirm,
  className,
}: AppointmentCardProps) {
  const isEditable = appointment.status === "scheduled"
  const isConfirmable = ["scheduled", "rescheduled"].includes(appointment.status)
  const isCancellable = ["scheduled", "confirmed"].includes(appointment.status)

  return (
    <Card
      data-slot="appointment-card"
      data-status={appointment.status}
      className={cn("hover:shadow-md transition-shadow", className)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{appointment.patientName}</CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <Stethoscope className="w-4 h-4" />
              {appointment.dentist}
            </CardDescription>
          </div>
          <AppointmentBadge status={appointment.status} showIcon={false} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Date and Time */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{appointment.dateTime.toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{appointment.dateTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>

        {/* Duration if available */}
        {appointment.duration && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Duration:</span> {appointment.duration} minutes
          </div>
        )}

        {/* Notes if available */}
        {appointment.notes && (
          <div className="text-sm bg-muted p-2 rounded border-l-2 border-muted-foreground">
            <p className="text-muted-foreground line-clamp-2">{appointment.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {isConfirmable && onConfirm && (
            <Button
              size="sm"
              variant="default"
              onClick={() => onConfirm(appointment.id)}
              aria-label={`Confirm appointment with ${appointment.patientName}`}
            >
              Confirm
            </Button>
          )}

          {isEditable && onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(appointment.id)}
              aria-label={`Edit appointment with ${appointment.patientName}`}
            >
              Edit
            </Button>
          )}

          {isCancellable && onCancel && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onCancel(appointment.id)}
              aria-label={`Cancel appointment with ${appointment.patientName}`}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

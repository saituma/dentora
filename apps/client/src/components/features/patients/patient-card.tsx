"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Mail, Phone, Calendar, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Patient card component - displays patient information in a compact card format.
 * Following shadcn/ui composition with accessibility.
 */
interface PatientInfo {
  id: string
  name: string
  email: string
  phone?: string
  lastVisit?: Date
  nextAppointment?: Date
  initials?: string
}

interface PatientCardProps {
  patient: PatientInfo
  onView?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  isLoading?: boolean
  className?: string
}

export function PatientCard({
  patient,
  onView,
  onEdit,
  onDelete,
  isLoading,
  className,
}: PatientCardProps) {
  const initials = patient.initials || patient.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  return (
    <Card
      data-slot="patient-card"
      className={cn("hover:shadow-md transition-shadow", isLoading && "opacity-50 pointer-events-none", className)}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-blue-100 text-blue-800 font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate">{patient.name}</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Email */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="w-4 h-4 flex-shrink-0" />
          <a href={`mailto:${patient.email}`} className="truncate hover:underline">
            {patient.email}
          </a>
        </div>

        {/* Phone */}
        {patient.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="w-4 h-4 flex-shrink-0" />
            <a href={`tel:${patient.phone}`} className="hover:underline">
              {patient.phone}
            </a>
          </div>
        )}

        {/* Next appointment */}
        {patient.nextAppointment && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            <span>Next: {patient.nextAppointment.toLocaleDateString()}</span>
          </div>
        )}

        {/* Last visit */}
        {patient.lastVisit && (
          <div className="text-xs text-muted-foreground">
            Last visit: {patient.lastVisit.toLocaleDateString()}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {onView && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onView(patient.id)}
              aria-label={`View ${patient.name}'s details`}
              disabled={isLoading}
            >
              View
            </Button>
          )}

          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(patient.id)}
              aria-label={`Edit ${patient.name}'s information`}
              disabled={isLoading}
            >
              Edit
            </Button>
          )}

          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(patient.id)}
              aria-label={`Delete ${patient.name}`}
              disabled={isLoading}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { useState, useCallback } from "react"
import { useForm, type UseFormProps, type FieldValues } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { ZodType } from "zod"

interface UseFormStateOptions<T extends FieldValues> extends UseFormProps<T> {
  schema: ZodType<T>
  onSubmit: (data: T) => Promise<void> | void
}

/**
 * Custom hook for managing form state with validation, loading, and error handling.
 * Simplifies common form patterns across DentalFlow.
 *
 * @example
 * const { form, handleSubmit, isSubmitting, submitError } = useFormState({
 *   schema: appointmentSchema,
 *   onSubmit: async (data) => await createAppointment(data),
 *   defaultValues: { date: "", time: "" },
 * })
 */
export function useFormState<T extends FieldValues>({
  schema,
  onSubmit,
  ...formProps
}: UseFormStateOptions<T>) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm<T>({
    ...formProps,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as any,
  })

  const handleSubmit = useCallback(
    form.handleSubmit(async (data) => {
      try {
        setIsSubmitting(true)
        setSubmitError(null)
        setSubmitSuccess(false)

        await onSubmit(data)

        setSubmitSuccess(true)
        // Auto-clear success after 3s
        const timer = setTimeout(() => setSubmitSuccess(false), 3000)
        return () => clearTimeout(timer)
      } catch (error) {
        const message = error instanceof Error ? error.message : "An error occurred"
        setSubmitError(message)
        console.error("Form submission error:", error)
      } finally {
        setIsSubmitting(false)
      }
    }),
    [form, onSubmit]
  )

  return {
    form,
    handleSubmit,
    isSubmitting,
    submitError,
    submitSuccess,
  }
}

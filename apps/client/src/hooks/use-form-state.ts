"use client"

import { useState, useCallback } from "react"
import { useForm, UseFormProps, FieldValues, FieldPath } from "react-hook-form"
import { ZodSchema } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

interface UseFormStateOptions<T extends FieldValues> extends UseFormProps<T> {
  schema: ZodSchema
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
    resolver: zodResolver(schema),
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

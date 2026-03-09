"use client"

import { ExampleWrapper } from "@/components/example"
import { CardExample } from "@/components/component-example/card-example"
import { FormExample } from "@/components/component-example/form-example"

export function ComponentExample() {
  return (
    <ExampleWrapper>
      <CardExample />
      <FormExample />
    </ExampleWrapper>
  )
}

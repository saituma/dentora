'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    setIsSubmitting(false);
    toast.success("Message sent! We'll get back to you soon.");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold">Get in touch</h1>
          <p className="mt-4 text-muted-foreground">
            Questions? Want a demo? We're here to help.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contact form</CardTitle>
            <CardDescription>
              Fill out the form and we'll respond within 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input name="name" placeholder="Your name" required />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    name="email"
                    type="email"
                    placeholder="you@clinic.com"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Message</FieldLabel>
                  <Textarea
                    name="message"
                    placeholder="Tell us about your practice..."
                    rows={5}
                    required
                  />
                </Field>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending...' : 'Send message'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

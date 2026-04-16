import type { ReactNode } from 'react';

interface LegalSection {
  title: string;
  content: ReactNode;
}

interface LegalPageProps {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export function LegalPage({
  eyebrow,
  title,
  description,
  effectiveDate,
  sections,
}: LegalPageProps) {
  return (
    <div className="bg-gradient-to-b from-primary/8 via-background to-background">
      <section className="border-b">
        <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base text-muted-foreground sm:text-lg">
            {description}
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Effective date: {effectiveDate}
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="space-y-8">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border bg-card p-6 shadow-sm"
              >
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

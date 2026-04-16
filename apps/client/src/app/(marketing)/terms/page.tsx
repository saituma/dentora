import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service | Dentora',
  description: 'Review the terms that govern your use of the Dentora platform.',
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms of Service"
      title="Terms for using Dentora"
      description="These Terms of Service govern access to and use of Dentora websites, software, and related services. By using the service, you agree to these terms."
      effectiveDate="April 16, 2026"
      sections={[
        {
          title: 'Use of the service',
          content: (
            <>
              <p>
                Dentora provides software and AI-powered tools intended to help
                dental clinics manage communication, scheduling, and patient
                engagement workflows. You agree to use the service only for
                lawful purposes and in accordance with these terms.
              </p>
              <p>
                You are responsible for maintaining the confidentiality of your
                account, controlling access to your credentials, and ensuring
                that information you submit is accurate and authorized.
              </p>
            </>
          ),
        },
        {
          title: 'Customer responsibilities',
          content: (
            <>
              <p>
                You are responsible for your clinic content, configuration,
                connected integrations, call routing decisions, and compliance
                with laws or professional obligations that apply to your use of
                the platform.
              </p>
              <p>
                You agree not to misuse the platform, interfere with service
                operation, attempt unauthorized access, or use the service to
                transmit unlawful, harmful, or infringing content.
              </p>
            </>
          ),
        },
        {
          title: 'Availability, changes, and termination',
          content: (
            <>
              <p>
                We may update, modify, suspend, or discontinue parts of the
                service from time to time. We may also suspend or terminate
                access if we believe these terms have been violated or if use of
                the service creates legal, security, or operational risk.
              </p>
              <p>
                We will use reasonable efforts to maintain service availability,
                but the platform is provided on an as-available basis.
              </p>
            </>
          ),
        },
        {
          title: 'Disclaimers and limitation of liability',
          content: (
            <>
              <p>
                To the fullest extent permitted by law, the service is provided
                without warranties of any kind, whether express or implied,
                including warranties of merchantability, fitness for a particular
                purpose, and non-infringement.
              </p>
              <p>
                To the fullest extent permitted by law, Dentora will not be
                liable for indirect, incidental, special, consequential, or
                punitive damages, or for any loss of profits, revenues, data, or
                goodwill arising from or related to use of the service.
              </p>
            </>
          ),
        },
        {
          title: 'Contact and updates',
          content: (
            <>
              <p>
                We may update these terms from time to time by posting revised
                terms on this page. Continued use of the service after an update
                becomes effective constitutes acceptance of the revised terms.
              </p>
              <p>
                If you have questions about these terms, please contact us
                through our{' '}
                <Link href="/contact" className="text-primary hover:underline">
                  contact page
                </Link>
                .
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

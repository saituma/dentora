import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy | Dentora',
  description:
    'Learn how Dentora collects, uses, and protects personal information.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy Policy"
      title="How Dentora handles your information"
      description="This Privacy Policy explains what information Dentora collects, how we use it, when we share it, and the choices available to clinics, visitors, and patients who interact with our services."
      effectiveDate="April 16, 2026"
      sections={[
        {
          title: 'Information we collect',
          content: (
            <>
              <p>
                We may collect information you provide directly to us, including
                clinic contact details, account credentials, billing details,
                support requests, and information submitted through onboarding or
                contact forms.
              </p>
              <p>
                We may also collect technical and usage information such as IP
                address, browser type, device information, pages visited, call
                activity metadata, and product interactions needed to operate,
                secure, and improve the platform.
              </p>
            </>
          ),
        },
        {
          title: 'How we use information',
          content: (
            <>
              <p>
                We use information to provide and maintain the Dentora platform,
                authenticate users, configure AI receptionist workflows, support
                scheduling and communication features, process payments, and
                respond to support requests.
              </p>
              <p>
                We may also use information to improve service quality, monitor
                reliability and security, comply with legal obligations, and
                communicate important updates about the product or your account.
              </p>
            </>
          ),
        },
        {
          title: 'How information may be shared',
          content: (
            <>
              <p>
                We may share information with service providers and infrastructure
                partners that help us host, secure, analyze, support, or operate
                the service. We may also share information when required by law,
                to enforce our terms, or to protect rights, safety, and security.
              </p>
              <p>
                We do not sell personal information for third-party advertising.
              </p>
            </>
          ),
        },
        {
          title: 'Data retention and security',
          content: (
            <>
              <p>
                We retain information for as long as reasonably necessary to
                provide the service, meet contractual commitments, resolve
                disputes, enforce agreements, and comply with applicable law.
              </p>
              <p>
                We use administrative, technical, and organizational safeguards
                designed to protect information. No method of transmission or
                storage is completely secure, so we cannot guarantee absolute
                security.
              </p>
            </>
          ),
        },
        {
          title: 'Your choices and contact',
          content: (
            <>
              <p>
                You may request access, correction, or deletion of certain
                information, subject to legal and operational requirements. You
                may also contact us with questions about this policy or your data.
              </p>
              <p>
                For privacy questions, please reach out through our{' '}
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

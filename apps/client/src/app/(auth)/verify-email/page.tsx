import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string | string[] }>;
}) {
  const resolvedParams = await searchParams;
  const token = typeof resolvedParams?.token === 'string' ? resolvedParams.token : null;

  return (
    <div className="w-full">
      <h2 className="font-display text-2xl font-bold mk-body">Verify your email</h2>
      <p className="mt-2 text-sm mk-muted">
        {token
          ? 'Your email has been verified. You can now sign in to your account.'
          : 'We sent a verification link to your email. Click the link to verify your account.'}
      </p>
      <div className="mt-6">
        <Button
          render={<Link href="/login" />}
          className="w-full rounded-full mk-btn-primary text-[15px] font-medium"
        >
          Go to sign in
        </Button>
      </div>
    </div>
  );
}

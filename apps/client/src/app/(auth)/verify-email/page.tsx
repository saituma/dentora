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
      <h2 className="font-display text-2xl font-bold text-black">Verify your email</h2>
      <p className="mt-2 text-sm text-gray-500">
        {token
          ? 'Your email has been verified. You can now sign in to your account.'
          : 'We sent a verification link to your email. Click the link to verify your account.'}
      </p>
      <div className="mt-6">
        <Button
          render={<Link href="/login" />}
          className="w-full rounded-full bg-[#b275ff] text-[15px] font-medium text-white hover:bg-[#a060f0]"
        >
          Go to sign in
        </Button>
      </div>
    </div>
  );
}

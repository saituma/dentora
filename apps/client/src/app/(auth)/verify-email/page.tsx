import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string | string[] }>;
}) {
  const resolvedParams = await searchParams;
  const token =
    typeof resolvedParams?.token === "string" ? resolvedParams.token : null;

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5 shadow-sm">
      <div className="rounded-[calc(1.5rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-8">
        <h2 className="text-2xl font-bold tracking-tight text-white">Verify your email</h2>
        <p className="mt-1 text-sm text-gray-400">
          {token
            ? "Your email has been verified. You can now sign in to your account."
            : "We sent a verification link to your email. Click the link to verify your account."}
        </p>
        <div className="mt-6">
          <Button render={<Link href="/login" />} className="w-full bg-blue-600 text-xs font-mono uppercase tracking-[0.14em] text-white hover:bg-blue-700">
            Go to sign in
          </Button>
        </div>
      </div>
    </div>
  );
}

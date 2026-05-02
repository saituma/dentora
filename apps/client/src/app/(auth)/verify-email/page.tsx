import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card className="w-full max-w-md border border-foreground/[0.12] bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-medium tracking-tight">Verify your email</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {token
            ? "Your email has been verified. You can now sign in to your account."
            : "We sent a verification link to your email. Click the link to verify your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

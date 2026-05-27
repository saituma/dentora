'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { CreditCard, BarChart2, FileText, Mail } from 'lucide-react';

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Billing" subtitle="Manage your subscription and view usage." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Current Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold">Starter</p>
            <CardDescription>Contact us to upgrade your plan.</CardDescription>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                window.location.href = 'mailto:support@dentora.ai';
              }}
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact support
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Usage this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Calls made</span>
              <span className="font-semibold tabular-nums">—</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Minutes used</span>
              <span className="font-semibold tabular-nums">—</span>
            </div>
            <CardDescription className="pt-1 text-xs">Usage tracking coming soon.</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No invoices available yet.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

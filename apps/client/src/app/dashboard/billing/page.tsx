"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { DownloadIcon } from "lucide-react";

const plans = [
  { name: "Starter", price: 49, minutes: 200 },
  { name: "Pro", price: 99, minutes: 500, current: true },
  { name: "Enterprise", price: 249, minutes: 1500 },
];

const invoices = [
  { id: "INV-001", date: "Mar 1, 2024", amount: 99, status: "paid" },
  { id: "INV-002", date: "Feb 1, 2024", amount: 99, status: "paid" },
  { id: "INV-003", date: "Jan 1, 2024", amount: 99, status: "paid" },
];

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and usage
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current plan</CardTitle>
            <CardDescription>Pro plan · $99/month</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Next billing date: April 1, 2024
            </p>
            <Button variant="outline" className="mt-4">
              Change plan
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Call minutes this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>247 / 500 minutes</span>
                <span className="text-muted-foreground">49%</span>
              </div>
              <Progress value={49} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={plan.current ? "border-primary" : ""}
          >
            <CardHeader>
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <CardDescription>
                ${plan.price}/month · {plan.minutes} min
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant={plan.current ? "secondary" : "outline"}
                className="w-full"
                disabled={plan.current}
              >
                {plan.current ? "Current plan" : "Upgrade"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Download past invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.id}</TableCell>
                  <TableCell>{inv.date}</TableCell>
                  <TableCell>${inv.amount}</TableCell>
                  <TableCell className="capitalize">{inv.status}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <DownloadIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

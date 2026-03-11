"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Download, ShieldCheck } from "lucide-react";

export default function StudentBillingPage() {
  const invoices = [
    { id: "INV-001", date: "May 1, 2024", amount: "$85.00", status: "Paid" },
    { id: "INV-002", date: "Apr 1, 2024", amount: "$85.00", status: "Paid" },
    { id: "INV-003", date: "Mar 1, 2024", amount: "$85.00", status: "Paid" },
  ];

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">Billing & Subscription</h1>
          <p className="text-muted-foreground">Manage your plan, payment methods, and billing history.</p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 border-primary/20">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Current Plan</CardTitle>
                  <CardDescription>Premium Coaching Tier</CardDescription>
                </div>
                <Badge className="bg-accent text-accent-foreground">Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border">
                <div>
                  <p className="text-sm font-bold">$85.00 / month</p>
                  <p className="text-xs text-muted-foreground">Next billing date: June 1, 2024</p>
                </div>
                <Button variant="outline" size="sm">Change Plan</Button>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-accent shrink-0" />
                  <p className="text-sm">Personalized training programs</p>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-accent shrink-0" />
                  <p className="text-sm">Unlimited messaging with coach</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6 bg-muted/5">
              <p className="text-xs text-muted-foreground">
                Subscription managed by Stripe. You can cancel your subscription at any time.
              </p>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>Your default card</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold">Visa ending in 4242</p>
                  <p className="text-xs text-muted-foreground">Expires 12/26</p>
                </div>
              </div>
              <Button variant="outline" className="w-full text-xs">Update Method</Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>Download past invoices for your records.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.id}</TableCell>
                    <TableCell>{invoice.date}</TableCell>
                    <TableCell>{invoice.amount}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-accent/10 text-accent hover:bg-accent/10">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Download className="h-4 w-4" /> PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </StudentNavigation>
  );
}

"use client";

import Link from "next/link";
import { Dumbbell, ArrowRight, ShieldCheck, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 px-6 h-16 flex items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Link href="/" className="flex items-center gap-2">
          <Dumbbell className="text-primary h-6 w-6" />
          <span className="text-xl font-bold tracking-tight">Sergio Oliveira PT</span>
        </Link>
        <div className="ml-auto">
          <Button variant="ghost" asChild>
            <Link href="/login">{t("signIn")}</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-20 px-6 text-center bg-gradient-to-b from-secondary/50 to-background">
          <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl font-headline">
              {t("elevateYour")}<span className="text-primary">{t("coaching")}</span>{t("business")}
            </h1>
            <p className="text-xl text-muted-foreground">
              {t("landingDescription")}
            </p>
            <div className="pt-4">
              <Button size="lg" className="h-12 px-8 text-lg gap-2" asChild>
                <Link href="/login">
                  {t("getStarted")} <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-20 px-6 max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                <UserCircle className="h-6 w-6" />
              </div>
              <CardTitle className="font-headline">{t("studentManagement")}</CardTitle>
              <CardDescription>{t("studentManagementDesc")}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle className="font-headline">{t("progressTracking")}</CardTitle>
              <CardDescription>{t("progressTrackingDesc")}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </section>
      </main>

      <footer className="py-8 px-6 border-t text-center text-muted-foreground text-sm">
        <p>{t("footerText")}</p>
      </footer>
    </div>
  );
}

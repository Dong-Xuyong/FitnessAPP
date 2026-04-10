"use client";

import Link from "next/link";
import { Dumbbell, ArrowRight, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 h-16 flex items-center border-b bg-card">
        <Link href="/" className="flex items-center gap-2">
          <Dumbbell className="text-primary h-6 w-6" />
          <span className="text-xl font-bold tracking-tight">ElevateFit</span>
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

        <section className="py-20 px-6 max-w-7xl mx-auto grid md:grid-cols-2 gap-12 max-w-3xl">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold font-headline">{t("studentManagement")}</h3>
            <p className="text-muted-foreground">{t("studentManagementDesc")}</p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold font-headline">{t("progressTracking")}</h3>
            <p className="text-muted-foreground">{t("progressTrackingDesc")}</p>
          </div>
        </section>
      </main>

      <footer className="py-8 px-6 border-t text-center text-muted-foreground text-sm">
        <p>{t("footerText")}</p>
      </footer>
    </div>
  );
}

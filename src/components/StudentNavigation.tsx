
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard,
  Dumbbell,
  BookOpen,
  History,
  LogOut,
  Play,
  CreditCard,
  User,
  Menu,
  Globe,
  ShieldBan,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth, useUser, useFirestore } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useStudentPaymentReminder } from "@/hooks/use-student-payment-reminder";

const navItems = [
  { key: "myDashboard" as const, href: "/student/dashboard", icon: LayoutDashboard },
  { key: "workouts" as const, href: "/student/workouts", icon: Dumbbell },
  { key: "workoutHistory" as const, href: "/student/workout-history", icon: History },
  { key: "exercises" as const, href: "/student/exercises", icon: BookOpen },
  { key: "exerciseHistory" as const, href: "/student/exercise-history", icon: History },
  { key: "billing" as const, href: "/student/billing", icon: CreditCard },
  { key: "profile" as const, href: "/student/profile", icon: User },
];

function splitName(rawName?: string): { firstName?: string; fullName?: string } {
  const value = (rawName || "").trim().replace(/\s+/g, " ");
  if (!value) return {};
  const first = value.split(" ")[0] || undefined;
  return { firstName: first, fullName: value };
}

export function StudentNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { user } = useUser();
  const { t, locale, setLocale } = useI18n();
  const { reminder } = useStudentPaymentReminder(db, user?.uid);
  const [profile, setProfile] = useState<{ firstName?: string; fullName?: string; photoUrl?: string } | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!db || !user?.uid) return;
    const uid = user.uid;

    async function fetchStudentProfile() {
      try {
        // Single read of global student doc — rules allow isOwner(studentId).
        // Do not query trainer subcollections by email; Firestore rules reject those queries.
        const ref = doc(db, "students", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          setIsBlocked(d.blocked === true);
          const fromName = splitName(typeof d.name === "string" ? d.name : undefined);
          const firstName =
            fromName.firstName ||
            (typeof d.firstName === "string" ? d.firstName : undefined);
          setProfile({
            fullName: fromName.fullName || (typeof d.name === "string" ? d.name : undefined),
            firstName,
            photoUrl: typeof d.photoUrl === "string" ? d.photoUrl : undefined,
          });
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.error("Error fetching profile for navigation", e);
        setProfile(null);
      }
    }

    fetchStudentProfile();
  }, [db, user?.uid, pathname]);

  const navLinkActive = (item: (typeof navItems)[number]) => pathname === item.href;

  const handleSignOut = () => {
    if (!auth) return;
    initiateSignOut(auth).then(() => {
      router.push("/");
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 border-r bg-card hidden md:flex flex-col fixed inset-y-0 overflow-hidden">
        <div className="p-6">
          <Link href="/student/dashboard" className="block">
          <Image
            src="/sergio-oliveira-logo.png"
            alt="Sergio Oliveira Personal Trainer"
            width={130}
            height={73}
            priority
            className="h-auto w-full max-w-[110px] rounded-md"
          />
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto min-h-0">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors",
                navLinkActive(item)
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-accent/5 hover:text-accent"
              )}
            >
              <item.icon className="h-5 w-5" />
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t mt-auto shrink-0">
          <div className="flex items-center gap-3 px-4 py-2 mb-4">
            <Avatar className="h-8 w-8 ring-2 ring-accent/10">
              <AvatarImage src={profile?.photoUrl || user?.photoURL || `https://picsum.photos/seed/${user?.uid || 's1'}/100/100`} />
              <AvatarFallback>{profile?.firstName?.[0] || user?.displayName?.[0] || user?.email?.[0] || "U"}</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-medium leading-none truncate">
                {profile?.fullName || profile?.firstName || user?.displayName || "Student"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || "Account"}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground" 
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5" />
            {t("logout")}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col h-full">
          <SheetTitle className="sr-only">Student navigation</SheetTitle>
          <div className="p-6 border-b">
            <Link
              href="/student/dashboard"
              className="block"
              onClick={() => setMobileOpen(false)}
            >
              <Image
                src="/sergio-oliveira-logo.png"
                alt="Sergio Oliveira Personal Trainer"
                width={130}
                height={73}
                priority
                className="h-auto w-full max-w-[110px] rounded-md"
              />
            </Link>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors",
                  navLinkActive(item)
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:bg-accent/5 hover:text-accent"
                )}
              >
                <item.icon className="h-5 w-5" />
                {t(item.key)}
              </Link>
            ))}
          </nav>
          <div className="p-4 pb-8 border-t mt-auto">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground"
              onClick={() => {
                setMobileOpen(false);
                handleSignOut();
              }}
            >
              <LogOut className="h-5 w-5" />
              {t("logout")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex-1 md:ml-64 flex flex-col">
        <header className="h-16 border-b bg-card/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold capitalize">
              {t("myDashboard")}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLocale("en")} className={locale === "en" ? "font-bold" : ""}>
                  English
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocale("pt")} className={locale === "pt" ? "font-bold" : ""}>
                  Português
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button className="hidden sm:flex gap-2 bg-accent text-accent-foreground hover:bg-accent/90" asChild>
              <Link href="/student/workouts">
                <Play className="h-4 w-4" />
                {t("startWorkout")}
              </Link>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto min-w-0">
          {reminder.show && !isBlocked ? (
            <Alert
              variant={reminder.variant === "overdue" ? "destructive" : "default"}
              className={
                reminder.variant === "soon"
                  ? "mb-4 border-amber-500/50 bg-amber-500/5 text-foreground [&>svg]:text-amber-600"
                  : "mb-4"
              }
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <AlertTitle className="pr-8">
                  {reminder.variant === "overdue"
                    ? t("paymentReminderOverdueTitle")
                    : t("paymentReminderSoonTitle")}
                </AlertTitle>
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-2">
                  <p className="text-sm opacity-95">
                    {(reminder.variant === "overdue"
                      ? t("paymentReminderOverdueDesc")
                      : t("paymentReminderSoonDesc")
                    ).replace(
                      "{date}",
                      reminder.dueDate.toLocaleDateString(locale === "pt" ? "pt-PT" : undefined, {
                        dateStyle: "long",
                      })
                    )}
                  </p>
                  <Button size="sm" variant="secondary" className="shrink-0 w-fit" asChild>
                    <Link href="/student/billing">{t("paymentReminderCta")}</Link>
                  </Button>
                </AlertDescription>
              </div>
            </Alert>
          ) : null}
          {isBlocked && pathname !== "/student/billing" ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
              <div className="rounded-full bg-destructive/10 p-6">
                <ShieldBan className="h-12 w-12 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold">Account Suspended</h2>
              <p className="text-muted-foreground max-w-md">
                Your account has been suspended by your coach. Please contact your coach for more information.
              </p>
              <Button asChild variant="outline" className="mt-4 gap-2">
                <Link href="/student/billing">
                  <CreditCard className="h-4 w-4" />
                  {t("billing")}
                </Link>
              </Button>
              <Button variant="ghost" className="gap-2" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

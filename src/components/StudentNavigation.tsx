
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard,
  Dumbbell,
  History,
  LogOut,
  Play,
  CreditCard,
  User,
  Menu,
  Globe,
  ShieldBan,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth, useUser, useFirestore } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState, useCallback } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useStudentPaymentReminder } from "@/hooks/use-student-payment-reminder";
import { STUDENT_PROFILE_PHOTO_UPDATED } from "@/lib/student-profile-events";

const navItems = [
  { key: "myDashboard" as const, href: "/student/dashboard", icon: LayoutDashboard },
  { key: "workouts" as const, href: "/student/workouts", icon: Dumbbell },
  { key: "workoutHistory" as const, href: "/student/workout-history", icon: History },
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

function StudentSidebarIdentity({
  profile,
  user,
  layout = "vertical",
  collapsed = false,
  onNavigate,
}: {
  profile: { firstName?: string; fullName?: string; photoUrl?: string } | null;
  user: ReturnType<typeof useUser>["user"];
  layout?: "vertical" | "horizontal";
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const displayName = profile?.fullName || profile?.firstName || user?.displayName || "Student";
  const avatarSrc =
    profile?.photoUrl || user?.photoURL || `https://picsum.photos/seed/${user?.uid || "s1"}/100/100`;
  const fallback = profile?.firstName?.[0] || user?.displayName?.[0] || user?.email?.[0] || "U";

  if (collapsed && layout === "vertical") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/student/dashboard"
            onClick={onNavigate}
            className="flex justify-center rounded-lg p-2 -m-2 transition-colors hover:bg-accent/5"
          >
            <Avatar className="h-10 w-10 shrink-0 ring-2 ring-accent/10">
              <AvatarImage src={avatarSrc} alt="" />
              <AvatarFallback className="text-sm">{fallback}</AvatarFallback>
            </Avatar>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[220px]">
          <p className="font-medium">{displayName}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const wrapClass =
    layout === "vertical"
      ? "flex flex-col items-center gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-accent/5"
      : "flex flex-row items-center gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-accent/5";

  const textAlign = layout === "vertical" ? "text-center" : "text-left";

  return (
    <Link href="/student/dashboard" className={wrapClass} onClick={onNavigate}>
      <Avatar
        className={cn(
          "shrink-0 ring-2 ring-accent/10",
          layout === "vertical" ? "h-16 w-16" : "h-12 w-12"
        )}
      >
        <AvatarImage src={avatarSrc} alt="" />
        <AvatarFallback className={layout === "vertical" ? "text-lg" : "text-sm"}>{fallback}</AvatarFallback>
      </Avatar>
      <div className={cn("min-w-0", layout === "horizontal" && "flex-1", textAlign)}>
        <p className="text-sm font-semibold leading-snug truncate">{displayName}</p>
      </div>
    </Link>
  );
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
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  const sidebarWidth = desktopSidebarCollapsed ? "w-[70px]" : "w-64";
  const mainMargin = desktopSidebarCollapsed ? "md:ml-[70px]" : "md:ml-64";

  const fetchStudentProfile = useCallback(async () => {
    if (!db || !user?.uid) return;
    const uid = user.uid;

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
  }, [db, user?.uid]);

  useEffect(() => {
    void fetchStudentProfile();
  }, [fetchStudentProfile]);

  useEffect(() => {
    const onPhotoUpdated = () => {
      void fetchStudentProfile();
    };
    window.addEventListener(STUDENT_PROFILE_PHOTO_UPDATED, onPhotoUpdated);
    return () => window.removeEventListener(STUDENT_PROFILE_PHOTO_UPDATED, onPhotoUpdated);
  }, [fetchStudentProfile]);

  const navLinkActive = (item: (typeof navItems)[number]) => pathname === item.href;

  const handleSignOut = () => {
    if (!auth) return;
    initiateSignOut(auth).then(() => {
      router.push("/");
    });
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "border-r bg-card hidden md:flex flex-col fixed inset-y-0 transition-all duration-300 ease-in-out z-40",
            sidebarWidth
          )}
        >
          <div className={cn("border-b shrink-0", desktopSidebarCollapsed ? "p-2" : "p-6 pb-4")}>
            <StudentSidebarIdentity
              profile={profile}
              user={user}
              layout="vertical"
              collapsed={desktopSidebarCollapsed}
            />
          </div>

          <nav className={cn("flex-1 space-y-1 overflow-y-auto min-h-0", desktopSidebarCollapsed ? "px-2" : "px-4")}>
            {navItems.map((item) => {
              const isActive = navLinkActive(item);
              const linkClass = cn(
                "flex items-center gap-3 rounded-md text-sm font-medium transition-colors",
                desktopSidebarCollapsed ? "justify-center px-3 py-3" : "px-4 py-3",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-accent/5 hover:text-accent"
              );

              if (desktopSidebarCollapsed) {
                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>
                      <Link href={item.href} className={linkClass}>
                        <item.icon className="h-5 w-5 shrink-0" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{t(item.key)}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link key={item.key} href={item.href} className={linkClass}>
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{t(item.key)}</span>
                </Link>
              );
            })}
          </nav>

          <div className={cn("border-t mt-auto shrink-0 space-y-1", desktopSidebarCollapsed ? "p-2" : "p-4")}>
            {desktopSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-full text-muted-foreground"
                    onClick={handleSignOut}
                  >
                    <LogOut className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("logout")}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="h-5 w-5" />
                {t("logout")}
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDesktopSidebarCollapsed((prev) => !prev)}
            className="absolute -right-3 top-16 z-50 flex h-6 w-6 items-center justify-center rounded-full border bg-card shadow-md hover:bg-accent/10 transition-colors"
            aria-label={desktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {desktopSidebarCollapsed ? (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col h-full">
          <SheetTitle className="sr-only">Student navigation</SheetTitle>
          <div className="p-6 border-b shrink-0">
            <StudentSidebarIdentity
              profile={profile}
              user={user}
              layout="horizontal"
              onNavigate={() => setMobileOpen(false)}
            />
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

        <div className={cn("flex-1 flex flex-col min-w-0 w-full transition-all duration-300 ease-in-out", mainMargin)}>
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
    </TooltipProvider>
  );
}

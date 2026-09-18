"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  LayoutDashboard,
  Dumbbell,
  History,
  BarChart3,
  LogOut,
  CreditCard,
  User,
  Store,
  Globe,
  ShieldBan,
  AlertCircle,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, useUser, useFirestore } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState, useCallback, useMemo } from "react";
import { isOpenTrainingAccess, normalizeTrainingAccessMode } from "@/lib/student-training-access";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StudentBirthdayPrompt } from "@/components/StudentBirthdayPrompt";
import { useStudentPaymentReminder } from "@/hooks/use-student-payment-reminder";
import { STUDENT_PROFILE_PHOTO_UPDATED } from "@/lib/student-profile-events";

type StudentNavItem = {
  key: TranslationKey;
  href: string;
  icon: LucideIcon;
};

type StudentNavGroup = {
  key: TranslationKey;
  items: StudentNavItem[];
};

const studentNavGroups: StudentNavGroup[] = [
  {
    key: "navGroupToday" as const,
    items: [
      { key: "myDashboard" as const, href: "/student/dashboard", icon: LayoutDashboard },
      { key: "workouts" as const, href: "/student/workouts", icon: Dumbbell },
    ],
  },
  {
    key: "navGroupLibrary" as const,
    items: [
      { key: "exercises" as const, href: "/student/exercises", icon: Search },
      { key: "workoutHistory" as const, href: "/student/workout-history", icon: History },
      { key: "exerciseHistory" as const, href: "/student/exercise-history", icon: BarChart3 },
    ],
  },
  {
    key: "navGroupAccount" as const,
    items: [
      { key: "billing" as const, href: "/student/billing", icon: CreditCard },
      { key: "shop" as const, href: "/student/shop", icon: Store },
      { key: "profile" as const, href: "/student/profile", icon: User },
    ],
  },
];

const navItems = studentNavGroups.flatMap((group) => group.items);

function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function splitName(rawName?: string): { firstName?: string; fullName?: string } {
  const value = (rawName || "").trim().replace(/\s+/g, " ");
  if (!value) return {};
  const first = value.split(" ")[0] || undefined;
  return { firstName: first, fullName: value };
}

function StudentLocaleToggle({
  locale,
  setLocale,
  collapsed = false,
}: {
  locale: string;
  setLocale: (locale: "en" | "pt") => void;
  collapsed?: boolean;
}) {
  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="icon" className="shrink-0">
        <Globe className="h-4 w-4" />
        <span className="sr-only">Language</span>
      </Button>
    </DropdownMenuTrigger>
  );

  const menu = (
    <DropdownMenuContent align={collapsed ? "center" : "start"} side={collapsed ? "right" : "top"}>
      <DropdownMenuItem onClick={() => setLocale("en")} className={locale === "en" ? "font-bold" : ""}>
        English
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setLocale("pt")} className={locale === "pt" ? "font-bold" : ""}>
        Português
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="w-full shrink-0">
            <Globe className="h-4 w-4" />
            <span className="sr-only">Language</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="center">
          <DropdownMenuItem onClick={() => setLocale("en")} className={locale === "en" ? "font-bold" : ""}>
            English
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocale("pt")} className={locale === "pt" ? "font-bold" : ""}>
            Português
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      {trigger}
      {menu}
    </DropdownMenu>
  );
}

function StudentSidebarUtilityControls({
  locale,
  setLocale,
  collapsed = false,
}: {
  locale: string;
  setLocale: (locale: "en" | "pt") => void;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <ThemeToggle />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">Toggle dark mode</TooltipContent>
        </Tooltip>
        <StudentLocaleToggle locale={locale} setLocale={setLocale} collapsed />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <StudentLocaleToggle locale={locale} setLocale={setLocale} />
    </div>
  );
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
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const displayName = hydrated
    ? profile?.fullName || profile?.firstName || user?.displayName || "Student"
    : "Student";
  const avatarSrc = hydrated
    ? profile?.photoUrl || user?.photoURL || `https://picsum.photos/seed/${user?.uid || "s1"}/100/100`
    : "https://picsum.photos/seed/s1/100/100";
  const fallback = hydrated
    ? profile?.firstName?.[0] || user?.displayName?.[0] || user?.email?.[0] || "U"
    : "U";

  if (collapsed && layout === "vertical") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/student/dashboard"
            onClick={onNavigate}
            aria-label={displayName}
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
        <p className="text-sm font-semibold leading-snug truncate" suppressHydrationWarning>
          {displayName}
        </p>
      </div>
    </Link>
  );
}

function StudentSidebarPanel({
  profile,
  user,
  visibleNavItems,
  navLinkActive,
  locale,
  setLocale,
  t,
  onSignOut,
}: {
  profile: { firstName?: string; fullName?: string; photoUrl?: string } | null;
  user: ReturnType<typeof useUser>["user"];
  visibleNavItems: StudentNavItem[];
  navLinkActive: (item: StudentNavItem) => boolean;
  locale: string;
  setLocale: (locale: "en" | "pt") => void;
  t: (key: TranslationKey) => string;
  onSignOut: () => void;
}) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <SidebarHeader
        className={cn(
          "border-b shrink-0",
          isMobile ? "p-6 pb-4 pr-14" : collapsed ? "p-2" : "p-6 pb-4"
        )}
      >
        <StudentSidebarIdentity
          profile={profile}
          user={user}
          layout={isMobile ? "horizontal" : "vertical"}
          collapsed={collapsed}
          onNavigate={isMobile ? closeMobile : undefined}
        />
      </SidebarHeader>

      <SidebarContent className={isMobile ? "py-4" : undefined}>
        <nav aria-label={t("sidebarNavigation")}>
          {studentNavGroups.map((group) => {
            const items = group.items.filter((item) =>
              visibleNavItems.some((visibleItem) => visibleItem.href === item.href)
            );
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={group.key}>
                <SidebarGroupLabel aria-hidden={collapsed}>{t(group.key)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {items.map((item) => {
                      const isActive = navLinkActive(item);
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={t(item.key)}
                            size="lg"
                            className="font-medium"
                          >
                            <Link
                              href={item.href}
                              onClick={closeMobile}
                              aria-current={isActive ? "page" : undefined}
                            >
                              <item.icon className="h-5 w-5" />
                              <span>{t(item.key)}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>

      <SidebarFooter
        className={cn(
          "border-t shrink-0 space-y-2",
          isMobile ? "p-4 pb-8 space-y-3" : collapsed ? "p-2" : "p-4"
        )}
      >
        <StudentSidebarUtilityControls locale={locale} setLocale={setLocale} collapsed={collapsed} />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("logout")}
              size="lg"
              className="font-medium text-muted-foreground hover:bg-accent/5 hover:text-accent"
              onClick={() => {
                closeMobile();
                onSignOut();
              }}
            >
              <LogOut className="h-5 w-5" />
              <span>{t("logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
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
  const [isOpenAccess, setIsOpenAccess] = useState(false);

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

        let accessMode = normalizeTrainingAccessMode(d.trainingAccessMode);
        const trainerId = typeof d.trainerId === "string" ? d.trainerId : undefined;
        const rosterId =
          (typeof d.rosterDocId === "string" && d.rosterDocId.trim()) || uid;
        if (trainerId) {
          const rosterSnap = await getDoc(
            doc(db, "personalTrainers", trainerId, "students", rosterId)
          );
          if (rosterSnap.exists()) {
            const rd = rosterSnap.data();
            if (rd?.trainingAccessMode != null) {
              accessMode = normalizeTrainingAccessMode(rd.trainingAccessMode);
            }
          }
        }
        setIsOpenAccess(isOpenTrainingAccess(accessMode));
      } else {
        setProfile(null);
        setIsOpenAccess(false);
      }
    } catch (e) {
      console.error("Error fetching profile for navigation", e);
      setProfile(null);
      setIsOpenAccess(false);
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

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !(isOpenAccess && item.key === "shop")),
    [isOpenAccess]
  );

  const navLinkActive = (item: StudentNavItem) =>
    isNavItemActive(pathname, item.href);
  const activeNavItem = visibleNavItems.find(navLinkActive);

  const handleSignOut = () => {
    if (!auth) return;
    initiateSignOut(auth).then(() => {
      router.push("/");
    });
  };

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="fixed left-4 top-[calc(1rem+env(safe-area-inset-top))] z-[100] -translate-y-[200%] rounded-md bg-background px-4 py-3 font-medium shadow-lg transition-transform focus:translate-y-0"
      >
        {t("skipToContent")}
      </a>
      <Sidebar collapsible="icon">
        <StudentSidebarPanel
          profile={profile}
          user={user}
          visibleNavItems={visibleNavItems}
          navLinkActive={navLinkActive}
          locale={locale}
          setLocale={setLocale}
          t={t}
          onSignOut={handleSignOut}
        />
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-50 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <SidebarTrigger className="shadow-sm" />
          <span className="truncate text-sm font-semibold">
            {t(activeNavItem?.key ?? "myDashboard")}
          </span>
        </header>

        <StudentBirthdayPrompt />

        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-x-hidden overflow-y-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:p-6 min-w-0"
        >
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
                  <Button
                    size="icon"
                    variant="secondary"
                    className="shrink-0"
                    asChild
                    title={t("paymentReminderCta")}
                  >
                    <Link href="/student/billing" aria-label={t("paymentReminderCta")}>
                      <CreditCard className="h-4 w-4" aria-hidden />
                    </Link>
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

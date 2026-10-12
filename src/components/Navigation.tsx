"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  LineChart,
  CalendarDays,
  LogOut,
  Search,
  User,
  Store,
  Banknote,
  Globe,
  Cake,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCoachBirthdayReminders } from "@/hooks/use-coach-birthday-reminders";
import type { UpcomingBirthdayStudent } from "@/lib/coach-birthday-reminders";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { doc } from "firebase/firestore";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";

type CoachNavItem = {
  key: TranslationKey;
  href: string;
  icon: LucideIcon;
};

type CoachNavGroup = {
  key: TranslationKey;
  items: CoachNavItem[];
};

const coachNavGroups: CoachNavGroup[] = [
  {
    key: "navGroupOverview" as const,
    items: [
      { key: "dashboard" as const, href: "/dashboard", icon: LayoutDashboard },
      { key: "coachProgressNav" as const, href: "/progress", icon: LineChart },
    ],
  },
  {
    key: "navGroupCoaching" as const,
    items: [
      { key: "assignmentCalendar" as const, href: "/assignment-calendar", icon: CalendarDays },
      { key: "students" as const, href: "/students", icon: Users },
      { key: "programs" as const, href: "/workouts", icon: Dumbbell },
      { key: "exercises" as const, href: "/exercises", icon: Search },
    ],
  },
  {
    key: "navGroupStudio" as const,
    items: [
      { key: "shop" as const, href: "/shop", icon: Store },
      { key: "revenue" as const, href: "/revenue", icon: Banknote },
      { key: "myProfile" as const, href: "/profile", icon: User },
    ],
  },
];

const coachNavItems = coachNavGroups.flatMap((group) => group.items);

function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type TrainerNavProfile = {
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
} | null;

type SidebarTranslate = (key: TranslationKey) => string;

function formatBirthdayWhenLabel(daysUntil: number, t: SidebarTranslate): string {
  if (daysUntil <= 0) return t("coachBirthdayWhenToday");
  if (daysUntil === 1) return t("coachBirthdayWhenTomorrow");
  return t("coachBirthdayWhenInDays").replace("{days}", String(daysUntil));
}

function trainerDisplayName(trainer: TrainerNavProfile): string {
  if (!trainer) return "Trainer";
  const n = `${trainer.firstName || ""} ${trainer.lastName || ""}`.trim();
  return n || "Trainer";
}

function TrainerSidebarIdentity({
  trainer,
  user,
  layout = "vertical",
  collapsed = false,
  onNavigate,
}: {
  trainer: TrainerNavProfile;
  user: { uid?: string; photoURL?: string | null; email?: string | null; displayName?: string | null } | null;
  layout?: "vertical" | "horizontal";
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const displayName = hydrated ? trainerDisplayName(trainer) : "Trainer";
  const avatarSrc = hydrated
    ? trainer?.photoUrl ||
      user?.photoURL ||
      `https://picsum.photos/seed/${encodeURIComponent(user?.uid || "trainer")}/100/100`
    : `https://picsum.photos/seed/trainer/100/100`;
  const fallback = hydrated
    ? (trainer?.firstName?.[0] || user?.displayName?.[0] || user?.email?.[0] || "T").toUpperCase()
    : "T";

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/dashboard"
            onClick={onNavigate}
            aria-label={displayName}
            className="flex items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          >
            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/10">
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
      ? "flex flex-col items-center gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-sidebar-accent"
      : "flex flex-row items-center gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-sidebar-accent";

  const textAlign = layout === "vertical" ? "text-center" : "text-left";

  return (
    <Link href="/dashboard" className={wrapClass} onClick={onNavigate}>
      <Avatar
        className={cn(
          "shrink-0 ring-2 ring-primary/10",
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

function TrainerLocaleToggle({
  locale,
  setLocale,
  collapsed = false,
}: {
  locale: string;
  setLocale: (locale: "en" | "pt") => void;
  collapsed?: boolean;
}) {
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
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span className="sr-only">Language</span>
          </Button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0">
          <Globe className="h-4 w-4" />
          <span className="sr-only">Language</span>
        </Button>
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  );
}

function TrainerSidebarUtilityControls({
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
        <ThemeToggle variant="ghost" className="h-8 w-8 text-muted-foreground" />
        <TrainerLocaleToggle locale={locale} setLocale={setLocale} collapsed />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <TrainerLocaleToggle locale={locale} setLocale={setLocale} />
    </div>
  );
}

function CoachBirthdaysButton({
  upcomingBirthdays,
  t,
  onNavigate,
}: {
  upcomingBirthdays: UpcomingBirthdayStudent[];
  t: SidebarTranslate;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const count = upcomingBirthdays.length;
  const today = upcomingBirthdays.some((b) => b.daysUntil === 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          aria-label={t("coachBirthdaysNavTitle")}
          className={cn("relative h-8 w-8 justify-center", today && "text-rose-600")}
        >
          <Cake className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-medium leading-none text-white">
              {count}
            </span>
          ) : null}
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-2">
        <p className="px-2 py-1 text-sm font-medium">{t("coachBirthdaysNavTitle")}</p>
        {count === 0 ? (
          <p className="px-2 pb-1 text-xs text-muted-foreground">{t("coachBirthdaysNavEmpty")}</p>
        ) : (
          <div className="flex max-h-72 flex-col">
            {upcomingBirthdays.map((b) => (
              <Link
                key={b.id}
                href={`/students/${b.id}`}
                onClick={() => {
                  setOpen(false);
                  onNavigate();
                }}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="truncate">{b.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    b.daysUntil === 0 ? "font-medium text-rose-600" : "text-muted-foreground"
                  )}
                >
                  {formatBirthdayWhenLabel(b.daysUntil, t)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AppSidebar({
  pathname,
  trainer,
  user,
  onSignOut,
  t,
  locale,
  setLocale,
  upcomingBirthdays,
}: {
  pathname: string;
  trainer: TrainerNavProfile;
  user: { uid?: string; photoURL?: string | null; email?: string | null; displayName?: string | null } | null;
  onSignOut: () => void;
  t: SidebarTranslate;
  locale: string;
  setLocale: (locale: "en" | "pt") => void;
  upcomingBirthdays: UpcomingBirthdayStudent[];
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleSignOut = () => {
    handleNavClick();
    onSignOut();
  };

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader
        className={cn(
          "w-full min-w-0 items-center",
          collapsed ? "px-0 py-3" : isMobile ? "p-4 pr-14" : "border-b border-sidebar-border p-4 pb-4"
        )}
      >
        <TrainerSidebarIdentity
          trainer={trainer}
          user={user}
          layout={isMobile ? "horizontal" : "vertical"}
          collapsed={collapsed}
          onNavigate={handleNavClick}
        />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <nav aria-label={t("sidebarNavigation")}>
          <SidebarMenu className="items-center gap-1 px-0 py-1">
            {coachNavItems
              .filter((item) => item.key !== "myProfile")
              .map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={t(item.key)}
                      className="h-8 w-8 justify-center"
                    >
                      <Link
                        href={item.href}
                        onClick={handleNavClick}
                        aria-label={t(item.key)}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <item.icon className="h-5 w-5" />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
          </SidebarMenu>
        </nav>
      </SidebarContent>

      <SidebarFooter className="items-center gap-1 border-t border-sidebar-border p-1.5">
        <SidebarMenu className="items-center">
          <SidebarMenuItem>
            <CoachBirthdaysButton
              upcomingBirthdays={upcomingBirthdays}
              t={t}
              onNavigate={handleNavClick}
            />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isNavItemActive(pathname, "/profile")}
              tooltip={t("myProfile")}
              className="h-8 w-8 justify-center"
            >
              <Link
                href="/profile"
                onClick={handleNavClick}
                aria-label={t("myProfile")}
                aria-current={isNavItemActive(pathname, "/profile") ? "page" : undefined}
              >
                <User className="h-5 w-5" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <TrainerSidebarUtilityControls locale={locale} setLocale={setLocale} collapsed={collapsed} />
        {collapsed ? (
          <SidebarMenuButton
            tooltip={t("logout")}
            aria-label={t("logout")}
            className="h-8 w-8 justify-center text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5" />
          </SidebarMenuButton>
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
      </SidebarFooter>

    </Sidebar>
  );
}

function CoachTopBar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { openMobile } = useSidebar();
  const activeNavItem = coachNavItems.find((item) => isNavItemActive(pathname, item.href));
  if (openMobile) return null;

  return (
    <header className="sticky top-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 bg-background px-2 pt-[env(safe-area-inset-top)] md:hidden">
      <SidebarTrigger className="-ml-1 shadow-sm" />
      <span className="truncate text-sm font-semibold">
        {t(activeNavItem?.key ?? "dashboard")}
      </span>
    </header>
  );
}

export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { user } = useUser();
  const { t, locale, setLocale } = useI18n();
  const { birthdays, upcomingBirthdays } = useCoachBirthdayReminders(db, user?.uid, t("unnamed"));

  const trainerRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "personalTrainers", user.uid);
  }, [db, user]);

  const { data: trainer } = useDoc(trainerRef);

  const handleSignOut = () => {
    if (!auth) return;
    initiateSignOut(auth);
    router.push("/");
  };

  const birthdayTitle =
    birthdays.length > 1 ? t("coachBirthdayTodayTitlePlural") : t("coachBirthdayTodayTitle");
  const birthdayDescription = (() => {
    if (birthdays.length === 0) return "";
    if (birthdays.length === 1) {
      const only = birthdays[0];
      if (only.turningAge != null) {
        return t("coachBirthdayTodayDescWithAge")
          .replace("{name}", only.name)
          .replace("{age}", String(only.turningAge));
      }
      return t("coachBirthdayTodayDesc").replace("{name}", only.name);
    }
    const names = birthdays.map((b) => b.name).join(", ");
    return t("coachBirthdayTodayDescPlural").replace("{names}", names);
  })();
  const birthdayHref =
    birthdays.length === 1 ? `/students/${birthdays[0].id}` : "/students";
  const birthdayCta =
    birthdays.length === 1 ? t("coachBirthdayCta") : t("coachBirthdayCtaList");

  return (
    <SidebarProvider open={false}>
      <a
        href="#main-content"
        className="fixed left-4 top-[calc(1rem+env(safe-area-inset-top))] z-[100] -translate-y-[200%] rounded-md bg-background px-4 py-3 font-medium shadow-lg transition-transform focus:translate-y-0"
      >
        {t("skipToContent")}
      </a>
      <AppSidebar
        pathname={pathname}
        trainer={trainer as TrainerNavProfile}
        user={user}
        onSignOut={handleSignOut}
        t={t}
        locale={locale}
        setLocale={setLocale}
        upcomingBirthdays={upcomingBirthdays}
      />
      <SidebarInset>
        <CoachTopBar />
        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-4 pb-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:p-6"
        >
          {birthdays.length > 0 ? (
            <Alert className="mb-4 border-rose-500/40 bg-rose-500/5 text-foreground [&>svg]:text-rose-600">
              <Cake className="h-4 w-4 shrink-0" />
              <div>
                <AlertTitle className="pr-8">{birthdayTitle}</AlertTitle>
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-2">
                  <p className="text-sm opacity-95">{birthdayDescription}</p>
                  <Button size="sm" variant="secondary" className="shrink-0 w-fit" asChild>
                    <Link href={birthdayHref}>{birthdayCta}</Link>
                  </Button>
                </AlertDescription>
              </div>
            </Alert>
          ) : null}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
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
  Globe,
  Cake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCoachBirthdayReminders } from "@/hooks/use-coach-birthday-reminders";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
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

const navItemKeys = [
  { key: "assignmentCalendar" as const, href: "/assignment-calendar", icon: CalendarDays },
  { key: "programs" as const, href: "/workouts", icon: Dumbbell },
  { key: "dashboard" as const, href: "/dashboard", icon: LayoutDashboard },
  { key: "coachProgressNav" as const, href: "/progress", icon: LineChart },
  { key: "students" as const, href: "/students", icon: Users },
  { key: "exercises" as const, href: "/exercises", icon: Search },
  { key: "shop" as const, href: "/shop", icon: Store },
  { key: "myProfile" as const, href: "/profile", icon: User },
];

type TrainerNavProfile = {
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
} | null;

type SidebarTranslate = (
  key:
    | "dashboard"
    | "students"
    | "programs"
    | "exercises"
    | "assignmentCalendar"
    | "coachProgressNav"
    | "myProfile"
    | "shop"
    | "logout"
) => string;

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
            className="flex justify-center rounded-lg p-2 -m-2 transition-colors hover:bg-sidebar-accent"
          >
            <Avatar className="h-10 w-10 shrink-0 ring-2 ring-primary/10">
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
          <Button variant="outline" size="icon" className="w-full shrink-0">
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
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <ThemeToggle />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">Toggle dark mode</TooltipContent>
        </Tooltip>
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

function AppSidebar({
  pathname,
  trainer,
  user,
  onSignOut,
  t,
  locale,
  setLocale,
}: {
  pathname: string;
  trainer: TrainerNavProfile;
  user: { uid?: string; photoURL?: string | null; email?: string | null; displayName?: string | null } | null;
  onSignOut: () => void;
  t: SidebarTranslate;
  locale: string;
  setLocale: (locale: "en" | "pt") => void;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleSignOut = () => {
    handleNavClick();
    onSignOut();
  };

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className={cn("border-b border-sidebar-border", collapsed ? "p-2" : "p-4 pb-4")}>
        <TrainerSidebarIdentity
          trainer={trainer}
          user={user}
          layout={isMobile ? "horizontal" : "vertical"}
          collapsed={collapsed}
          onNavigate={handleNavClick}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItemKeys.map((item) => (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={t(item.key)}
                  size="lg"
                >
                  <Link href={item.href} onClick={handleNavClick}>
                    <item.icon className="h-5 w-5" />
                    <span>{t(item.key)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter
        className={cn("border-t border-sidebar-border space-y-2", collapsed ? "p-2" : "p-4")}
      >
        <TrainerSidebarUtilityControls locale={locale} setLocale={setLocale} collapsed={collapsed} />
        {collapsed ? (
          <SidebarMenuButton
            tooltip={t("logout")}
            className="text-muted-foreground"
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

      <SidebarRail />
    </Sidebar>
  );
}

export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { user } = useUser();
  const { t, locale, setLocale } = useI18n();
  const { birthdays } = useCoachBirthdayReminders(db, user?.uid, t("unnamed"));

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
    <SidebarProvider>
      <AppSidebar
        pathname={pathname}
        trainer={trainer as TrainerNavProfile}
        user={user}
        onSignOut={handleSignOut}
        t={t}
        locale={locale}
        setLocale={setLocale}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden sticky top-0 z-50 bg-background/95 backdrop-blur">
          <SidebarTrigger className="-ml-1 shadow-sm" />
        </header>
        <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto px-4 pb-4 md:p-6">
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

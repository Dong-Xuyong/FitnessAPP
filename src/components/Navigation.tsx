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
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { doc } from "firebase/firestore";
import { useState, useEffect } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";
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
            className="flex justify-center rounded-lg p-2 -m-2 transition-colors hover:bg-accent/5"
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
      ? "flex flex-col items-center gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-accent/5"
      : "flex flex-row items-center gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-accent/5";

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

/* ─── Shared sidebar nav content ─── */
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

function SidebarContent({
  pathname,
  trainer,
  user,
  onSignOut,
  onNavClick,
  t,
  locale,
  setLocale,
}: {
  pathname: string;
  trainer: TrainerNavProfile;
  user: { uid?: string; photoURL?: string | null; email?: string | null; displayName?: string | null } | null;
  onSignOut: () => void;
  onNavClick?: () => void;
  t: SidebarTranslate;
  locale: string;
  setLocale: (locale: "en" | "pt") => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-4 border-b shrink-0">
        <TrainerSidebarIdentity
          trainer={trainer}
          user={user}
          layout="horizontal"
          onNavigate={onNavClick}
        />
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-2 space-y-1 mt-2">
        {navItemKeys.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavClick}
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-accent/10 hover:text-primary"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{t(item.key)}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom: theme, language, logout */}
      <div className="p-4 border-t mt-auto space-y-3 shrink-0">
        <TrainerSidebarUtilityControls locale={locale} setLocale={setLocale} />
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => {
            onNavClick?.();
            onSignOut();
          }}
        >
          <LogOut className="h-5 w-5" />
          {t("logout")}
        </Button>
      </div>
    </div>
  );
}

/* ─── Main Navigation component ─── */
export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { user } = useUser();
  const { t, locale, setLocale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const sidebarWidth = collapsed ? "w-[70px]" : "w-64";
  const mainMargin = collapsed ? "md:ml-[70px]" : "md:ml-64";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen bg-background">

        {/* ── DESKTOP Sidebar ── */}
        <aside
          className={cn(
            "border-r bg-card hidden md:flex flex-col fixed inset-y-0 transition-all duration-300 ease-in-out z-40",
            sidebarWidth
          )}
        >
          {/* Logo */}
          <div className={cn("border-b shrink-0", collapsed ? "p-2" : "p-4 pb-4")}>
            <TrainerSidebarIdentity
              trainer={trainer as TrainerNavProfile}
              user={user}
              layout="vertical"
              collapsed={collapsed}
            />
          </div>

          {/* Nav Items */}
          <nav className="flex-1 px-2 space-y-1 mt-2">
            {navItemKeys.map((item) => {
              const isActive = pathname === item.href;
              const linkClass = cn(
                "flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "",
                isActive
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-accent/10 hover:text-primary"
              );

              if (collapsed) {
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

          {/* Bottom: theme, language, logout */}
          <div className={cn("border-t mt-auto shrink-0 space-y-2", collapsed ? "p-2" : "p-4")}>
            <TrainerSidebarUtilityControls locale={locale} setLocale={setLocale} collapsed={collapsed} />
            {collapsed ? (
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
                <TooltipContent side="right">Logout</TooltipContent>
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

          {/* Collapse Toggle Button */}
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="absolute -right-3 top-16 z-50 flex h-6 w-6 items-center justify-center rounded-full border bg-card shadow-md hover:bg-accent/10 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </aside>

        {/* ── MOBILE Sheet Sidebar ── */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-72">
            <SheetTitle className="sr-only">Main navigation</SheetTitle>
            <SidebarContent
              pathname={pathname}
              trainer={trainer as TrainerNavProfile}
              user={user}
              onSignOut={handleSignOut}
              onNavClick={() => setMobileOpen(false)}
              t={t}
              locale={locale}
              setLocale={setLocale}
            />
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <div className={cn("flex-1 flex flex-col min-w-0 w-full transition-all duration-300 ease-in-out", mainMargin)}>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden fixed top-3 left-3 z-50 shadow-sm bg-background/95 backdrop-blur"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <main className="flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto min-w-0">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

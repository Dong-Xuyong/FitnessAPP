"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  Dumbbell, 
  LineChart, 
  LogOut, 
  Search,
  Plus,
  Bell,
  CheckCircle2,
  AlertCircle,
  User,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { doc } from "firebase/firestore";
import { useState } from "react";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Students", href: "/students", icon: Users },
  { name: "Programs", href: "/workouts", icon: Dumbbell },
  { name: "Exercises", href: "/exercises", icon: Search },
  { name: "Progress", href: "/progress", icon: LineChart },
  { name: "My Profile", href: "/profile", icon: User },
];

const mockNotifications = [
  { id: 1, title: "Workout Logged", description: "Alex Johnson completed 'Upper Body Push A'", time: "10m ago", icon: CheckCircle2, type: "success" },
  { id: 2, title: "New PR Alert", description: "Sarah Williams hit a new Squat PR: 65kg!", time: "45m ago", icon: Bell, type: "info" },
  { id: 3, title: "Pending Program", description: "Mike Tyson is waiting for his new routine", time: "2h ago", icon: AlertCircle, type: "warning" },
];

/* ─── Shared sidebar nav content ─── */
function SidebarContent({
  pathname,
  trainer,
  user,
  onSignOut,
  onNavClick,
}: {
  pathname: string;
  trainer: Record<string, string> | null;
  user: { uid?: string; photoURL?: string | null; email?: string | null } | null;
  onSignOut: () => void;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center gap-2">
        <div className="w-8 h-8 shrink-0 rounded-lg bg-primary flex items-center justify-center">
          <Dumbbell className="text-primary-foreground h-5 w-5" />
        </div>
        <span className="text-xl font-bold font-headline tracking-tight text-primary">ElevateFit</span>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-2 space-y-1 mt-2">
        {navItems.map((item) => (
          <Link
            key={item.name}
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
            <span className="truncate">{item.name}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom: Avatar + Logout */}
      <div className="p-2 border-t mt-auto space-y-1">
        <Link
          href="/profile"
          onClick={onNavClick}
          className="flex items-center gap-3 px-4 py-2 mb-1 hover:bg-accent/5 rounded-lg transition-colors group"
        >
          <Avatar className="h-8 w-8 ring-2 ring-primary/10 group-hover:ring-primary/30 transition-all">
            <AvatarImage
              src={
                (trainer as any)?.photoUrl ||
                user?.photoURL ||
                `https://picsum.photos/seed/${user?.uid}/100/100`
              }
            />
            <AvatarFallback>
              {(trainer as any)?.firstName?.[0] || user?.email?.[0] || "T"}
            </AvatarFallback>
          </Avatar>
          <div className="overflow-hidden">
            <p className="text-sm font-medium leading-none truncate group-hover:text-primary transition-colors">
              {trainer
                ? `${(trainer as any).firstName} ${(trainer as any).lastName}`
                : "Trainer"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || "Account"}</p>
          </div>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={onSignOut}
        >
          <LogOut className="h-5 w-5" />
          Logout
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
          <div className={cn("p-4 flex items-center", collapsed ? "justify-center" : "justify-between")}>
            {!collapsed ? (
              <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-primary flex items-center justify-center">
                  <Dumbbell className="text-primary-foreground h-5 w-5" />
                </div>
                <span className="text-xl font-bold font-headline tracking-tight text-primary whitespace-nowrap">
                  ElevateFit
                </span>
              </Link>
            ) : (
              <Link href="/dashboard">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Dumbbell className="text-primary-foreground h-5 w-5" />
                </div>
              </Link>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 px-2 space-y-1 mt-2">
            {navItems.map((item) => {
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
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>
                      <Link href={item.href} className={linkClass}>
                        <item.icon className="h-5 w-5 shrink-0" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link key={item.name} href={item.href} className={linkClass}>
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Bottom: Avatar + Logout */}
          <div className="p-2 border-t mt-auto space-y-1">
            {collapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/profile"
                      className="flex items-center justify-center px-3 py-2 hover:bg-accent/5 rounded-lg transition-colors"
                    >
                      <Avatar className="h-8 w-8 ring-2 ring-primary/10 hover:ring-primary/30 transition-all">
                        <AvatarImage
                          src={
                            (trainer as any)?.photoUrl ||
                            user?.photoURL ||
                            `https://picsum.photos/seed/${user?.uid}/100/100`
                          }
                        />
                        <AvatarFallback>
                          {(trainer as any)?.firstName?.[0] || user?.email?.[0] || "T"}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {trainer
                      ? `${(trainer as any).firstName} ${(trainer as any).lastName}`
                      : "Profile"}
                  </TooltipContent>
                </Tooltip>
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
              </>
            ) : (
              <>
                <Link
                  href="/profile"
                  className="flex items-center gap-3 px-4 py-2 mb-1 hover:bg-accent/5 rounded-lg transition-colors group"
                >
                  <Avatar className="h-8 w-8 ring-2 ring-primary/10 group-hover:ring-primary/30 transition-all">
                    <AvatarImage
                      src={
                        (trainer as any)?.photoUrl ||
                        user?.photoURL ||
                        `https://picsum.photos/seed/${user?.uid}/100/100`
                      }
                    />
                    <AvatarFallback>
                      {(trainer as any)?.firstName?.[0] || user?.email?.[0] || "T"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium leading-none truncate group-hover:text-primary transition-colors">
                      {trainer
                        ? `${(trainer as any).firstName} ${(trainer as any).lastName}`
                        : "Trainer"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email || "Account"}</p>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-muted-foreground"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-5 w-5" />
                  Logout
                </Button>
              </>
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
            <SidebarContent
              pathname={pathname}
              trainer={trainer as any}
              user={user}
              onSignOut={handleSignOut}
              onNavClick={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <div className={cn("flex-1 flex flex-col transition-all duration-300 ease-in-out", mainMargin)}>
          {/* Header */}
          <header className="h-16 border-b bg-card/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <h1 className="text-lg font-semibold capitalize">
                {pathname.split("/")[1] || "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-4 border-b">
                    <h3 className="font-bold">Notifications</h3>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div className="divide-y">
                      {mockNotifications.map((notif) => (
                        <div key={notif.id} className="p-4 hover:bg-accent/5 flex gap-3">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                              notif.type === "success"
                                ? "bg-accent/10 text-accent"
                                : notif.type === "warning"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            <notif.icon className="w-4 h-4" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold leading-none">{notif.title}</p>
                            <p className="text-xs text-muted-foreground">{notif.description}</p>
                            <p className="text-[10px] text-muted-foreground">{notif.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="p-2 border-t text-center">
                    <Button variant="ghost" size="sm" className="w-full text-xs text-primary">
                      Mark all as read
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button className="hidden sm:flex gap-2" asChild>
                <Link href="/workouts/builder">
                  <Plus className="h-4 w-4" />
                  New Program
                </Link>
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Students", href: "/students", icon: Users },
  { name: "Programs", href: "/workouts", icon: Dumbbell },
  { name: "Exercises", href: "/exercises", icon: Search },
  { name: "Progress", href: "/progress", icon: LineChart },
];

const mockNotifications = [
  { id: 1, title: "Workout Logged", description: "Alex Johnson completed 'Upper Body Push A'", time: "10m ago", icon: CheckCircle2, type: "success" },
  { id: 2, title: "New PR Alert", description: "Sarah Williams hit a new Squat PR: 65kg!", time: "45m ago", icon: Bell, type: "info" },
  { id: 3, title: "Pending Program", description: "Mike Tyson is waiting for his new routine", time: "2h ago", icon: AlertCircle, type: "warning" },
];

export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card hidden md:flex flex-col fixed inset-y-0">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Dumbbell className="text-primary-foreground h-5 w-5" />
            </div>
            <span className="text-xl font-bold font-headline tracking-tight text-primary">ElevateFit</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-accent/10 hover:text-primary"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3 px-4 py-2 mb-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src="https://picsum.photos/seed/trainer1/100/100" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-medium leading-none">John Doe</p>
              <p className="text-xs text-muted-foreground truncate">Head Trainer</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" asChild>
            <Link href="/">
              <LogOut className="h-5 w-5" />
              Logout
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 md:ml-64 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b bg-card/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
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
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          notif.type === 'success' ? 'bg-accent/10 text-accent' :
                          notif.type === 'warning' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                        )}>
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
                  <Button variant="ghost" size="sm" className="w-full text-xs text-primary">Mark all as read</Button>
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

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Dumbbell, 
  LineChart, 
  LogOut,
  Bell,
  MessageSquare,
  Play,
  CreditCard,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const navItems = [
  { name: "My Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
  { name: "Workouts", href: "/student/workouts", icon: Dumbbell },
  { name: "Progress", href: "/student/progress", icon: LineChart },
  { name: "Billing", href: "/student/billing", icon: CreditCard },
];

const mockStudentNotifications = [
  { id: 1, title: "New Routine Assigned", description: "Coach John assigned 'Upper Body Hypertrophy'", time: "Just now", icon: Dumbbell, type: "primary" },
  { id: 2, title: "Coach Feedback", description: "John left a note on your Squat progress", time: "3h ago", icon: MessageSquare, type: "info" },
  { id: 3, title: "Reminder", description: "Don't forget to log your weight today!", time: "5h ago", icon: Calendar, type: "warning" },
];

export function StudentNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card hidden md:flex flex-col fixed inset-y-0">
        <div className="p-6">
          <Link href="/student/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-accent-foreground">
              <Dumbbell className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold font-headline tracking-tight text-accent">ElevateStudent</span>
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
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-accent/5 hover:text-accent"
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
              <AvatarImage src="https://picsum.photos/seed/s1/100/100" />
              <AvatarFallback>AJ</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-medium leading-none">Alex Johnson</p>
              <p className="text-xs text-muted-foreground truncate">Student Account</p>
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
              Student Portal
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="relative" asChild>
              <Link href="/student/messages">
                <MessageSquare className="h-5 w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Link>
            </Button>
            
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
                    {mockStudentNotifications.map((notif) => (
                      <div key={notif.id} className="p-4 hover:bg-accent/5 flex gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          notif.type === 'primary' ? 'bg-accent/10 text-accent' :
                          notif.type === 'warning' ? 'bg-destructive/10 text-destructive' : 'bg-blue-500/10 text-blue-500'
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
              </PopoverContent>
            </Popover>

            <Button className="hidden sm:flex gap-2 bg-accent text-accent-foreground hover:bg-accent/90" asChild>
              <Link href="/student/workouts">
                <Play className="h-4 w-4" />
                Log Workout
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

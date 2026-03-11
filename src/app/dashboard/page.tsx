import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Dumbbell, Activity, Calendar, ArrowUpRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

export default function DashboardPage() {
  const stats = [
    { label: "Active Students", value: "12", icon: Users, change: "+2 this month" },
    { label: "Programs Assigned", value: "8", icon: Dumbbell, change: "5 pending" },
    { label: "Total Sessions", value: "124", icon: Activity, change: "+12% vs last month" },
    { label: "Scheduled Today", value: "4", icon: Calendar, change: "Next: Sarah (2 PM)" },
  ];

  const recentStudents = [
    { name: "Alex Johnson", goal: "Muscle Gain", weight: "78kg", level: "Intermediate", img: "1" },
    { name: "Sarah Williams", goal: "Weight Loss", weight: "65kg", level: "Beginner", img: "2" },
    { name: "Mike Tyson", goal: "Strength", weight: "102kg", level: "Advanced", img: "3" },
  ];

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <stat.icon className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="col-span-1">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Active Students</CardTitle>
                <CardDescription>Manage your current student roster</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/students">View All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {recentStudents.map((student, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={`https://picsum.photos/seed/s${student.img}/100/100`} />
                        <AvatarFallback>{student.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium leading-none">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{student.goal}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{student.weight}</p>
                      <p className="text-xs text-primary font-semibold">{student.level}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Quick Insights</CardTitle>
              <CardDescription>Visual summary of performance</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-accent/5">
              <div className="text-center space-y-2">
                <TrendingUp className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">Overall progress charts will appear here as students log data.</p>
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  Detailed Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Navigation>
  );
}
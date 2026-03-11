"use client";

import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Users, Award, Calendar } from "lucide-react";

export default function ProgressPage() {
  const leaderBoard = [
    { name: "Alex Johnson", score: 95, color: "bg-primary" },
    { name: "Mike Tyson", score: 88, color: "bg-accent" },
    { name: "Sarah Williams", score: 72, color: "bg-blue-500" },
  ];

  return (
    <Navigation>
      <div className="space-y-8">
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-primary text-primary-foreground overflow-hidden relative">
            <div className="absolute right-0 bottom-0 opacity-10">
              <Award className="w-32 h-32" />
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Team Velocity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">84%</div>
              <p className="text-sm opacity-90">Workout completion rate this week.</p>
            </CardContent>
          </Card>
          
          <Card className="bg-accent text-accent-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Growth Metric
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">+12.4kg</div>
              <p className="text-sm opacity-90">Total strength gained by team this month.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Top Performer
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src="https://picsum.photos/seed/s1/100/100" />
                <AvatarFallback>AJ</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold">Alex Johnson</p>
                <p className="text-xs text-muted-foreground">15 sessions streak 🔥</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Completion Leaderboard</CardTitle>
              <CardDescription>Consistency tracking across your roster</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {leaderBoard.map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{item.name}</span>
                    <span>{item.score}%</span>
                  </div>
                  <Progress value={item.score} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Milestones</CardTitle>
              <CardDescription>Next goals to celebrate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { name: "Sarah Williams", target: "5kg weight loss", date: "In 2 days" },
                { name: "Chris Evans", target: "100kg Bench Press", date: "Next session" },
                { name: "Mike Tyson", target: "50 session milestone", date: "Friday" },
              ].map((milestone, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                  <div>
                    <p className="text-sm font-bold">{milestone.name}</p>
                    <p className="text-xs text-muted-foreground">{milestone.target}</p>
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {milestone.date}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </Navigation>
  );
}


import Link from "next/link";
import { Dumbbell, ArrowRight, ShieldCheck, Zap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 h-16 flex items-center border-b bg-card">
        <Link href="/" className="flex items-center gap-2">
          <Dumbbell className="text-primary h-6 w-6" />
          <span className="text-xl font-bold tracking-tight">ElevateFit</span>
        </Link>
        <div className="ml-auto">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-20 px-6 text-center bg-gradient-to-b from-secondary/50 to-background">
          <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl font-headline">
              Elevate Your <span className="text-primary">Coaching</span> Business
            </h1>
            <p className="text-xl text-muted-foreground">
              A professional platform for personal trainers to manage students, build programs, and track results.
            </p>
            <div className="pt-4">
              <Button size="lg" className="h-12 px-8 text-lg gap-2" asChild>
                <Link href="/login">
                  Get Started <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-20 px-6 max-w-7xl mx-auto grid md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold font-headline">Student Management</h3>
            <p className="text-muted-foreground">Keep all your student data, goals, and history in one centralized, secure location.</p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold font-headline">AI Program Builder</h3>
            <p className="text-muted-foreground">Generate tailored workout plans instantly based on student goals and fitness levels.</p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold font-headline">Progress Tracking</h3>
            <p className="text-muted-foreground">Visual charts for weight and strength progress help keep students motivated and on track.</p>
          </div>
        </section>
      </main>

      <footer className="py-8 px-6 border-t text-center text-muted-foreground text-sm">
        <p>© 2024 ElevateFit. Built for champions.</p>
      </footer>
    </div>
  );
}

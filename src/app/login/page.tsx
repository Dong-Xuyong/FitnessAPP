
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Mail, Lock, Loader2, User, GraduationCap, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth, useUser, useFirestore } from "@/firebase";
import { initiateEmailSignIn, initiateEmailSignUp, initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isTrainer, setIsTrainer] = useState(searchParams.get("role") !== "student");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(false);

  useEffect(() => {
    async function handleRedirect() {
      if (user && !isUserLoading && db) {
        setIsCheckingRole(true);
        try {
          const ptDoc = await getDoc(doc(db, "personalTrainers", user.uid));
          if (ptDoc.exists()) {
            router.push("/dashboard");
          } else {
            router.push("/student/dashboard");
          }
        } catch (error) {
          router.push("/student/dashboard");
        } finally {
          setIsCheckingRole(false);
        }
      }
    }
    handleRedirect();
  }, [user, isUserLoading, router, db]);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setIsSubmitting(true);
    try {
      await initiateEmailSignIn(auth, email, password);
    } catch (error: any) {
      setIsSubmitting(false);
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: "Invalid email or password.",
      });
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !db) return;
    setIsSubmitting(true);
    try {
      const userCredential = await initiateEmailSignUp(auth, email, password);
      const uid = userCredential.user.uid;
      
      if (isTrainer) {
        const trainerData = {
          id: uid,
          firstName: email.split('@')[0],
          lastName: "Trainer",
          email: email,
          dateJoined: new Date().toISOString(),
        };
        await setDoc(doc(db, "personalTrainers", uid), trainerData);
        router.push("/dashboard");
      } else {
        const studentData = {
          userId: uid,
          firstName: email.split('@')[0],
          lastName: "Student",
          email: email,
          joinedAt: new Date().toISOString(),
          activityStatus: "active",
        };
        await setDoc(doc(db, "students", uid), studentData);
        router.push("/student/dashboard");
      }
    } catch (error: any) {
      setIsSubmitting(false);
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error.message || "Could not create account.",
      });
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    setIsSubmitting(true);
    try {
      await initiateGoogleSignIn(auth);
    } catch (error: any) {
      setIsSubmitting(false);
      toast({
        variant: "destructive",
        title: "Google Sign-In Failed",
        description: error.message,
      });
    }
  };

  if (isUserLoading || isCheckingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-secondary/50 to-background">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <Dumbbell className="text-primary h-8 w-8" />
        <span className="text-2xl font-bold tracking-tight font-headline">ElevateFit</span>
      </Link>

      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold font-headline">
            {isTrainer ? "Coach Access" : "Student Access"}
          </CardTitle>
          <CardDescription>
            {isTrainer 
              ? "Manage your roster and workout plans." 
              : "Access your training and track progress."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="name@example.com" 
                      className="pl-10" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="password" 
                      type="password" 
                      className="pl-10" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                    />
                  </div>
                </div>
                <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleEmailSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="signup-email" 
                      type="email" 
                      placeholder="name@example.com" 
                      className="pl-10" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="signup-password" 
                      type="password" 
                      className="pl-10" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                    />
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="trainer-toggle" 
                    checked={isTrainer} 
                    onCheckedChange={(checked) => setIsTrainer(checked as boolean)} 
                  />
                  <Label htmlFor="trainer-toggle" className="text-sm font-normal cursor-pointer">
                    I am registering as a <span className="font-bold text-primary">Personal Trainer</span>
                  </Label>
                </div>

                <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <Button 
            variant="outline" 
            type="button" 
            className="w-full" 
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </Button>
        </CardContent>
        <CardFooter className="justify-center border-t py-4 bg-muted/20">
          <Button 
            variant="link" 
            size="sm" 
            className="text-xs"
            onClick={() => setIsTrainer(!isTrainer)}
          >
            Switch to {isTrainer ? "Student" : "Coach"} Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

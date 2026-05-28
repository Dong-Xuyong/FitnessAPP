
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Mail, Lock, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

import { useAuth, useUser, useFirestore } from "@/firebase";
import { initiateEmailSignIn, initiateEmailSignUp } from "@/firebase/non-blocking-login";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { sendEmailVerification, sendPasswordResetEmail, signOut } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

function LoginContent() {
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const { t } = useI18n();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

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
        title: t("loginFailed"),
        description: t("invalidCredentials"),
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
      const studentData = {
        userId: uid,
        firstName: email.split('@')[0],
        lastName: "",
        email: email,
        joinedAt: new Date().toISOString(),
        activityStatus: "active",
      };
      await setDoc(doc(db, "students", uid), studentData);
      await sendEmailVerification(userCredential.user);
      await signOut(auth);
      setVerificationEmail(email);
      setVerificationPending(true);
      setIsSubmitting(false);
    } catch (error: any) {
      setIsSubmitting(false);
      toast({
        variant: "destructive",
        title: t("registrationFailed"),
        description: error.message || t("couldNotCreateAccount"),
      });
    }
  };

  if (isUserLoading || isCheckingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("authenticating")}</p>
        </div>
      </div>
    );
  }

  const handleResendVerification = async () => {
    if (!auth) return;
    setIsResending(true);
    try {
      const cred = await initiateEmailSignIn(auth, verificationEmail, password);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      toast({
        title: t("verificationEmailSent"),
        description: t("verificationEmailDesc"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("couldNotResend"),
        description: t("couldNotResendDesc"),
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!auth) return;
    if (!email.trim()) {
      toast({
        variant: "destructive",
        title: t("emailRequired"),
        description: t("enterEmailToResetPassword"),
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast({
        title: t("passwordResetSent"),
        description: t("passwordResetSentDesc"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("passwordResetFailed"),
        description: t("passwordResetFailedDesc"),
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (verificationPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-secondary/50 to-background">
        <Link href="/" className="flex items-center gap-2 mb-8">
          <Image
            src="/sergio-oliveira-logo.png"
            alt="Sergio Oliveira PT"
            width={44}
            height={44}
            priority
            className="h-11 w-11 rounded-md object-cover"
          />
          <span className="text-2xl font-bold tracking-tight font-headline">Sergio Oliveira PT</span>
        </Link>
        <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold font-headline">{t("checkYourEmail")}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground leading-relaxed">
              {t("verificationLinkSent")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("emailDestination")}
              </p>
              <p className="mt-1 text-sm font-semibold break-all">{verificationEmail}</p>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleResendVerification}
              disabled={isResending}
            >
              {isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("resendVerificationEmail")}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setVerificationPending(false);
                setPassword("");
              }}
            >
              {t("backToSignIn")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-secondary/50 to-background">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <Image
          src="/sergio-oliveira-logo.png"
          alt="Sergio Oliveira PT"
          width={44}
          height={44}
          priority
          className="h-11 w-11 rounded-md object-cover"
        />
        <span className="text-2xl font-bold tracking-tight font-headline">Sergio Oliveira PT</span>
      </Link>

      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold font-headline">{t("welcomeBack")}</CardTitle>
          <CardDescription>{t("signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">{t("signIn")}</TabsTrigger>
              <TabsTrigger value="signup">{t("signUp")}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
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
                  <Label htmlFor="password">{t("password")}</Label>
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
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm text-primary"
                  onClick={handleForgotPassword}
                  disabled={isResettingPassword}
                >
                  {isResettingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("forgotPassword")}
                </Button>
                <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("signIn")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleEmailSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">{t("email")}</Label>
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
                  <Label htmlFor="signup-password">{t("password")}</Label>
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

                <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("createAccount")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

        </CardContent>

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

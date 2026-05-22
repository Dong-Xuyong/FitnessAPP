
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  ChevronRight, 
  Loader2, 
  Users,
  Ban,
  Banknote,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import { getStudentDisplayName, getStudentEmail } from "@/lib/student-display";
import { fetchRosterPaymentStatusMap } from "@/lib/roster-payment-status";
import { normalizedPaymentPaid } from "@/lib/student-payment-due";

export default function StudentsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { t, locale } = useI18n();
  
  const [searchQuery, setSearchQuery] = useState("");

  // All Students Query - Show all students from the global collection
  const allStudentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "students");
  }, [db, user]);

  const { data: allStudents, isLoading } = useCollection(allStudentsQuery);

  // Trainer roster contains private coaching notes and trainer-only fields.
  const rosterQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);
  const { data: rosterStudents, isLoading: isRosterLoading } = useCollection(rosterQuery);

  const rosterByStudentId = (rosterStudents || []).reduce<Record<string, Record<string, unknown>>>(
    (acc, s: any) => {
      if (typeof s.id === "string" && s.id) acc[s.id] = s;
      if (typeof s.userId === "string" && s.userId) acc[s.userId] = s;
      return acc;
    },
    {}
  );

  // Fetch latest payment status for each roster student
  const [paymentStatusMap, setPaymentStatusMap] = useState<Record<string, { status: string; period: string }>>({});
  const fetchPaymentStatuses = useCallback(async () => {
    if (!db || !user || !rosterStudents || rosterStudents.length === 0) {
      setPaymentStatusMap({});
      return;
    }
    const ids = rosterStudents.map((s: any) => s.id).filter((id: string) => Boolean(id));
    const map = await fetchRosterPaymentStatusMap(db, user.uid, ids);
    setPaymentStatusMap(map);
  }, [db, user, rosterStudents]);

  useEffect(() => {
    fetchPaymentStatuses();
  }, [fetchPaymentStatuses]);

  const q = searchQuery.toLowerCase().trim();
  const sortLocale = locale === "pt" ? "pt-PT" : "en-US";

  const filteredStudents = useMemo(() => {
    if (!allStudents?.length) return [];
    const nameFallback = t("unnamed");
    const collatorOpts: Intl.CollatorOptions = { sensitivity: "base" };
    return [...allStudents]
      .filter((s) => {
        if (s.id === user?.uid) return false;
        if (!q) return true;
        const row = s as Record<string, unknown>;
        const name = getStudentDisplayName(row, nameFallback).toLowerCase();
        const email = getStudentEmail(row).toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .sort((a, b) => {
        const rowA = a as Record<string, unknown>;
        const rowB = b as Record<string, unknown>;
        const cmp = getStudentDisplayName(rowA, nameFallback).localeCompare(
          getStudentDisplayName(rowB, nameFallback),
          sortLocale,
          collatorOpts
        );
        if (cmp !== 0) return cmp;
        return getStudentEmail(rowA).localeCompare(getStudentEmail(rowB), sortLocale, collatorOpts);
      });
  }, [allStudents, user?.uid, q, t, sortLocale]);

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold font-headline">{t("allStudents")}</h2>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t("searchByNameOrEmail")} 
                className="pl-10" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {isLoading || isRosterLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredStudents.map((student) => {
                const row = student as Record<string, unknown>;
                const rosterRow = rosterByStudentId[student.id] as Record<string, unknown> | undefined;
                const displayName = getStudentDisplayName(row, t("unnamed"));
                const email = getStudentEmail(row);
                const privateNote =
                  typeof rosterRow?.coachingNotes === "string" ? rosterRow.coachingNotes.trim() : "";
                const isBlocked = rosterRow?.blocked === true;
                const paymentInfo = paymentStatusMap[student.id];
                const initial =
                  (displayName !== t("unnamed") ? displayName[0] : undefined) ||
                  email[0]?.toUpperCase() ||
                  "?";

                return (
                <Card key={student.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-0">
                    <Link href={`/students/${student.id}`} className="flex items-center gap-4 p-4">
                      <Avatar className="h-12 w-12 border-2 border-primary/10 shrink-0">
                        <AvatarImage src={(row.photoUrl as string) || `https://picsum.photos/seed/${student.id}/100/100`} />
                        <AvatarFallback>{initial}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-start sm:items-center min-w-0">
                        <div className="min-w-0 sm:col-span-1 md:col-span-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
                            {t("name")}
                          </p>
                          <h3 className="font-semibold group-hover:text-primary transition-colors truncate">
                            {displayName}
                          </h3>
                          {rosterRow && (
                            <Badge variant="outline" className="mt-1 text-[10px] uppercase tracking-wide">{t("roster")}</Badge>
                          )}
                          {isBlocked && (
                            <Badge variant="destructive" className="mt-1 text-[10px] uppercase tracking-wide gap-1">
                              <Ban className="h-3 w-3" /> {t("blocked")}
                            </Badge>
                          )}
                          {rosterRow && paymentInfo && (
                            <Badge
                              variant={normalizedPaymentPaid(paymentInfo.status) ? "default" : "outline"}
                              className={`mt-1 text-[10px] uppercase tracking-wide gap-1 ${normalizedPaymentPaid(paymentInfo.status)
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"}`}
                            >
                              <Banknote className="h-3 w-3" />
                              {normalizedPaymentPaid(paymentInfo.status) ? "Paid" : "Pending"}
                            </Badge>
                          )}
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-2 mb-0.5">
                            {t("email")}
                          </p>
                          <p
                            className={`text-sm break-all ${email ? "text-foreground" : "text-muted-foreground italic"}`}
                          >
                            {email || t("noEmailOnFile")}
                          </p>
                          {privateNote && (
                            <>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-2 mb-0.5">
                                {t("privateNote")}
                              </p>
                              <p className="text-sm text-muted-foreground line-clamp-2">{privateNote}</p>
                            </>
                          )}
                        </div>
                        <div className="hidden md:block text-center">
                          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t("goal")}</p>
                          <p className="text-sm font-medium capitalize">
                            {String(row.goalType || "not set").replace(/_/g, " ")}
                          </p>
                        </div>
                        <div className="hidden md:block text-center">
                          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t("weight")}</p>
                          <p className="text-sm font-medium">{student.weightKg || '--'} kg</p>
                        </div>
                        <div className="text-right flex items-center justify-end gap-4 sm:col-span-2 md:col-span-1">
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0" />
                        </div>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              );
              })}
              {filteredStudents.length === 0 && !isLoading && (
                <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg bg-accent/5">
                  <Users className="h-10 w-10 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">{t("noStudentsFound")}</p>
                  <p className="text-sm">
                    {searchQuery ? t("tryDifferentSearchTerm") : t("noStudentsInSystem")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Navigation>
  );
}

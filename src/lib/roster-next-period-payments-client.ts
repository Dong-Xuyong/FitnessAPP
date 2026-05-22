import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

export type NextPeriodBulkResponse = {
  ok: boolean;
  period: string;
  deleted?: number;
  processed?: number;
  skipped?: number;
  errors?: number;
};

export async function callCreateNextPeriodPayments(trainerId: string): Promise<NextPeriodBulkResponse> {
  const functions = getFunctions(getApp(), "europe-west1");
  const fn = httpsCallable<{ trainerId: string }, NextPeriodBulkResponse>(
    functions,
    "createNextPeriodPaymentsCallable"
  );
  const res = await fn({ trainerId });
  return res.data;
}

export async function callRemoveNextPeriodPayments(trainerId: string): Promise<NextPeriodBulkResponse> {
  const functions = getFunctions(getApp(), "europe-west1");
  const fn = httpsCallable<{ trainerId: string }, NextPeriodBulkResponse>(
    functions,
    "removeNextPeriodPaymentsCallable"
  );
  const res = await fn({ trainerId });
  return res.data;
}

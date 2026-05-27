import type { TranslationKey } from "@/lib/i18n";

export function paymentMethodLabel(
  method: string | undefined,
  t: (key: TranslationKey) => string
): string {
  const m = String(method || "").trim().toLowerCase();
  if (m === "mbway") return t("mbway");
  if (m === "bank_transfer") return t("bankTransfer");
  if (m === "cash") return t("cash");
  return method || "—";
}

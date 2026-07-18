"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useConsent } from "@/components/consent";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/lib/navigation";

const passwordSchema = z.object({ password: z.string().min(8) });
type PasswordValues = z.infer<typeof passwordSchema>;

const codeSchema = z.object({ code: z.string().min(6).max(6) });
type CodeValues = z.infer<typeof codeSchema>;

interface Enrollment {
  backupCodes: string[];
  totpURI: string;
}

/** TOTP enrollment: password → QR + backup codes → first code verifies. */
function TwoFactorCard() {
  const t = useTranslations("settings.twoFactor");
  const { data: session } = authClient.useSession();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });
  const codeForm = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const enabled = Boolean(session?.user.twoFactorEnabled);

  const startEnrollment = passwordForm.handleSubmit(async (values) => {
    const { data, error } = await authClient.twoFactor.enable({
      password: values.password,
    });
    if (error || !data) {
      toast.error(t("wrongPassword"));
      return;
    }
    passwordForm.reset();
    setEnrollment({ totpURI: data.totpURI, backupCodes: data.backupCodes });
  });

  const confirmEnrollment = codeForm.handleSubmit(async (values) => {
    const { error } = await authClient.twoFactor.verifyTotp({
      code: values.code,
    });
    if (error) {
      toast.error(t("invalidCode"));
      return;
    }
    codeForm.reset();
    setEnrollment(null);
    toast.success(t("enabled"));
  });

  const disable = passwordForm.handleSubmit(async (values) => {
    const { error } = await authClient.twoFactor.disable({
      password: values.password,
    });
    if (error) {
      toast.error(t("wrongPassword"));
      return;
    }
    passwordForm.reset();
    setDisableOpen(false);
    toast.success(t("disabled"));
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {enabled ? t("enabledDescription") : t("disabledDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {enabled ? (
          <Button onClick={() => setDisableOpen(true)} variant="destructive">
            {t("disableAction")}
          </Button>
        ) : (
          <Form {...passwordForm}>
            <form className="grid max-w-sm gap-4" onSubmit={startEnrollment}>
              <FormField
                control={passwordForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("passwordLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="current-password"
                        type="password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="w-fit"
                disabled={passwordForm.formState.isSubmitting}
                type="submit"
              >
                {t("enableAction")}
              </Button>
            </form>
          </Form>
        )}

        {/* Enrollment: scan, save backup codes, confirm with a first code. */}
        <Dialog
          onOpenChange={(open) => !open && setEnrollment(null)}
          open={Boolean(enrollment)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("enrollTitle")}</DialogTitle>
              <DialogDescription>{t("enrollDescription")}</DialogDescription>
            </DialogHeader>
            {enrollment ? (
              <div className="grid gap-4">
                <div className="flex justify-center rounded-md bg-white p-4">
                  <QRCodeSVG size={192} value={enrollment.totpURI} />
                </div>
                <div>
                  <p className="mb-2 font-medium text-sm">
                    {t("backupCodesTitle")}
                  </p>
                  <p className="mb-2 text-muted-foreground text-sm">
                    {t("backupCodesDescription")}
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
                    {enrollment.backupCodes.join("\n")}
                  </pre>
                </div>
                <Form {...codeForm}>
                  <form className="grid gap-4" onSubmit={confirmEnrollment}>
                    <FormField
                      control={codeForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("confirmCodeLabel")}</FormLabel>
                          <FormControl>
                            <Input
                              autoComplete="one-time-code"
                              inputMode="numeric"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        disabled={codeForm.formState.isSubmitting}
                        type="submit"
                      >
                        {t("confirmAction")}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog onOpenChange={setDisableOpen} open={disableOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("disableTitle")}</DialogTitle>
              <DialogDescription>{t("disableDescription")}</DialogDescription>
            </DialogHeader>
            <Form {...passwordForm}>
              <form className="grid gap-4" onSubmit={disable}>
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwordLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="current-password"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    disabled={passwordForm.formState.isSubmitting}
                    type="submit"
                    variant="destructive"
                  >
                    {t("disableAction")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/** GDPR self-service: data export (art. 20) and cookie preferences. */
function PrivacyCard() {
  const t = useTranslations("settings.privacy");
  const { openPreferences } = useConsent();
  const [exporting, setExporting] = useState(false);

  async function downloadExport() {
    setExporting(true);
    try {
      const response = await fetch("/api/me/export", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`export failed: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "my-data.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button disabled={exporting} onClick={downloadExport} variant="outline">
          {t("downloadData")}
        </Button>
        <Button onClick={openPreferences} variant="outline">
          {t("cookiePreferences")}
        </Button>
        {/* Plain link (no asChild/render): identical under both UI variants. */}
        <Link
          className="inline-flex items-center px-3 text-muted-foreground text-sm underline-offset-4 hover:underline"
          href="/legal/privacy"
        >
          {t("privacyPolicy")}
        </Link>
      </CardContent>
    </Card>
  );
}

/** GDPR right to erasure (art. 17): password-confirmed, blocks sole owners. */
function DeleteAccountCard() {
  const t = useTranslations("settings.deleteAccount");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  const deleteAccount = form.handleSubmit(async (values) => {
    const { error } = await authClient.deleteUser({
      password: values.password,
    });
    if (error) {
      // Surfaces the sole-owner block message from the API when present.
      toast.error(error.message || t("failed"));
      return;
    }
    toast.success(t("deleted"));
    router.push("/login");
    router.refresh();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => setOpen(true)} variant="destructive">
          {t("action")}
        </Button>
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("confirmTitle")}</DialogTitle>
              <DialogDescription>{t("confirmDescription")}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="grid gap-4" onSubmit={deleteAccount}>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("passwordLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="current-password"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    disabled={form.formState.isSubmitting}
                    type="submit"
                    variant="destructive"
                  >
                    {t("confirmAction")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  return (
    <div className="grid gap-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <TwoFactorCard />
      <PrivacyCard />
      <DeleteAccountCard />
    </div>
  );
}

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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";

const codeSchema = z.object({ code: z.string().min(6).max(32) });
type CodeValues = z.infer<typeof codeSchema>;

/** Second step of sign-in for accounts with 2FA enabled. */
export default function TwoFactorPage() {
  const t = useTranslations("twoFactor");
  const router = useRouter();
  const [useBackupCode, setUseBackupCode] = useState(false);

  const form = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code: values.code })
      : await authClient.twoFactor.verifyTotp({ code: values.code });
    if (error) {
      toast.error(t("invalidCode"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {useBackupCode ? t("backupDescription") : t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {useBackupCode ? t("backupCodeLabel") : t("codeLabel")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="one-time-code"
                        inputMode={useBackupCode ? "text" : "numeric"}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="w-full"
                disabled={form.formState.isSubmitting}
                type="submit"
              >
                {t("verifyAction")}
              </Button>
            </form>
          </Form>
          <Button
            className="mt-4 w-full"
            onClick={() => setUseBackupCode((current) => !current)}
            type="button"
            variant="ghost"
          >
            {useBackupCode ? t("useTotp") : t("useBackupCode")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

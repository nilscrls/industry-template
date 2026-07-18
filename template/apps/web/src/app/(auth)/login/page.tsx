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
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/lib/navigation";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { data, error } = await authClient.signIn.email(values);
    if (error) {
      toast.error(t("invalidCredentials"));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      // twoFactorClient's onTwoFactorRedirect is navigating to /two-factor.
      return;
    }
    router.push(searchParams.get("next") ?? "/dashboard");
    router.refresh();
  });

  async function signInWithMicrosoft() {
    const { error } = await authClient.signIn.social({
      provider: "microsoft",
      callbackURL: searchParams.get("next") ?? "/dashboard",
    });
    if (error) {
      toast.error(t("microsoftFailed"));
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("loginTitle")}</CardTitle>
          <CardDescription>{t("loginDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("email")}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="email"
                        placeholder="you@example.com"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("password")}</FormLabel>
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
                className="w-full"
                disabled={form.formState.isSubmitting}
                type="submit"
              >
                {t("loginAction")}
              </Button>
            </form>
          </Form>
          <div className="mt-4 grid gap-2">
            <div className="relative text-center">
              <span className="relative z-10 bg-card px-2 text-muted-foreground text-xs uppercase">
                {t("orContinueWith")}
              </span>
              <span className="absolute inset-x-0 top-1/2 border-t" />
            </div>
            <Button
              onClick={signInWithMicrosoft}
              type="button"
              variant="outline"
            >
              {t("microsoftAction")}
            </Button>
          </div>
          <p className="mt-4 text-center text-muted-foreground text-sm">
            {t("noAccount")}{" "}
            <Link className="underline underline-offset-4" href="/register">
              {t("registerAction")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

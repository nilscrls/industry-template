"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { cn } from "@repo/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Building2Icon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/lib/navigation";

const createOrgSchema = z.object({ name: z.string().min(1).max(100) });
type CreateOrgValues = z.infer<typeof createOrgSchema>;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org"
  );
}

/**
 * Tenant switcher: every query in the app is scoped to the session's active
 * organization, so switching invalidates the whole query cache.
 */
export function OrgSwitcher() {
  const t = useTranslations("organizations");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();

  const form = useForm<CreateOrgValues>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "" },
  });

  async function refreshScope() {
    await queryClient.invalidateQueries();
    router.refresh();
  }

  async function setActive(organizationId: string) {
    const { error } = await authClient.organization.setActive({
      organizationId,
    });
    if (error) {
      toast.error(t("switchFailed"));
      return;
    }
    await refreshScope();
  }

  const onCreate = form.handleSubmit(async (values) => {
    const { data, error } = await authClient.organization.create({
      name: values.name,
      slug: slugify(values.name),
    });
    if (error || !data) {
      toast.error(t("createFailed"));
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    setCreateOpen(false);
    form.reset();
    toast.success(t("created"));
    await refreshScope();
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="max-w-40 truncate" size="sm" variant="outline" />
          }
        >
          <Building2Icon />
          <span className="truncate">
            {activeOrganization?.name ?? t("noOrganization")}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("switchLabel")}</DropdownMenuLabel>
          {(organizations ?? []).map((organization) => (
            <DropdownMenuItem
              className={cn(
                organization.id === activeOrganization?.id && "font-semibold"
              )}
              key={organization.id}
              onClick={() => setActive(organization.id)}
            >
              {organization.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            {t("createAction")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={onCreate}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nameLabel")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button disabled={form.formState.isSubmitting} type="submit">
                  {t("createSubmit")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

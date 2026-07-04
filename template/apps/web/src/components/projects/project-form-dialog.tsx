"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  createProjectSchema,
  type Project,
  projectStatuses,
} from "@repo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client, orpc } from "@/lib/api";
import { useAppMutation } from "@/lib/use-app-mutation";

// No .default() here: the form always supplies status, keeping zod's input
// and output types identical (what RHF's resolver generics require).
const formSchema = createProjectSchema.extend({
  status: z.enum(projectStatuses),
});
type FormValues = z.infer<typeof formSchema>;

interface ProjectFormDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** null → create, a project → edit */
  project: Project | null;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: ProjectFormDialogProps) {
  const t = useTranslations("projects");
  const tStatus = useTranslations("projects.status");
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", status: "draft" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: project?.name ?? "",
        description: project?.description ?? "",
        status: project?.status ?? "draft",
      });
    }
  }, [open, project, form]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.projects.key() });

  const createMutation = useAppMutation({
    mutationFn: (values: FormValues) =>
      client.projects.create({
        ...values,
        description: values.description || undefined,
      }),
    successMessage: "projectCreated",
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  const updateMutation = useAppMutation({
    mutationFn: (values: FormValues) => {
      if (!project) {
        throw new Error("no project to update");
      }
      return client.projects.update({
        id: project.id,
        name: values.name,
        description: values.description || null,
        status: values.status,
      });
    },
    successMessage: "projectUpdated",
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  const mutation = project ? updateMutation : createMutation;
  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {project ? t("editTitle") : t("createTitle")}
          </DialogTitle>
          <DialogDescription>{t("formDescription")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.description")}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.status")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projectStatuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {tStatus(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button disabled={mutation.isPending} type="submit">
                {project ? t("saveAction") : t("createSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

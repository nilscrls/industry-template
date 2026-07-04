"use client";

import { Slot } from "@radix-ui/react-slot";
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const Form = FormProvider;

type FormFieldContextValue = { name: string };
const FormFieldContext = createContext<FormFieldContextValue | null>(null);

type FormItemContextValue = { id: string };
const FormItemContext = createContext<FormItemContextValue | null>(null);

function FormField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>(
  props: ControllerProps<TFieldValues, TName>
) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext?.name });
  if (!(fieldContext && itemContext)) {
    throw new Error("useFormField must be used within <FormField> and <FormItem>");
  }
  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: ComponentProps<"div">) {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn("grid gap-2", className)} data-slot="form-item" {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      className={cn("data-[error=true]:text-destructive", className)}
      data-error={!!error}
      data-slot="form-label"
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl(props: ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={!!error}
      data-slot="form-control"
      id={formItemId}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();
  return <p className={cn("text-muted-foreground text-sm", className)} data-slot="form-description" id={formDescriptionId} {...props} />;
}

function FormMessage({ className, children, ...props }: ComponentProps<"p"> & { children?: ReactNode }) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message ?? "") : children;
  if (!body) {
    return null;
  }
  return (
    <p className={cn("text-destructive text-sm", className)} data-slot="form-message" id={formMessageId} {...props}>
      {body}
    </p>
  );
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };

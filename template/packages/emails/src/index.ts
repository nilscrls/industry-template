import { render } from "@react-email/render";
import ResetPassword from "./templates/reset-password.js";
import VerifyEmail from "./templates/verify-email.js";

export interface RenderedEmail {
  html: string;
  subject: string;
  text: string;
}

export interface AuthEmailInput {
  type: "verify-email" | "reset-password";
  url: string;
  userName: string;
}

const SUBJECTS: Record<AuthEmailInput["type"], string> = {
  "verify-email": "Confirm your email address",
  "reset-password": "Reset your password",
};

export async function renderAuthEmail(
  input: AuthEmailInput
): Promise<RenderedEmail> {
  const element =
    input.type === "verify-email"
      ? VerifyEmail({ userName: input.userName, url: input.url })
      : ResetPassword({ userName: input.userName, url: input.url });
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { subject: SUBJECTS[input.type], html, text };
}

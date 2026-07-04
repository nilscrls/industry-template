import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "./layout.js";

export type ResetPasswordProps = { userName: string; url: string };

export default function ResetPassword({ userName, url }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Reset your password">
      <Heading style={styles.heading}>Reset your password</Heading>
      <Text style={styles.text}>Hi {userName},</Text>
      <Text style={styles.text}>
        Someone requested a password reset for your account. If this was you, click below — the link expires shortly.
        Otherwise you can safely ignore this email.
      </Text>
      <Button href={url} style={styles.button}>
        Reset password
      </Button>
      <Text style={{ ...styles.text, marginTop: "16px" }}>Or copy this link into your browser:</Text>
      <Text style={styles.link}>{url}</Text>
    </EmailLayout>
  );
}

ResetPassword.PreviewProps = { userName: "Ada", url: "https://example.com/reset?token=demo" } satisfies ResetPasswordProps;

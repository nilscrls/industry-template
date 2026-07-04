import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "./layout.js";

export interface VerifyEmailProps {
  url: string;
  userName: string;
}

export default function VerifyEmail({ userName, url }: VerifyEmailProps) {
  return (
    <EmailLayout preview="Confirm your email address">
      <Heading style={styles.heading}>Confirm your email</Heading>
      <Text style={styles.text}>Hi {userName},</Text>
      <Text style={styles.text}>
        Click the button below to verify your email address and activate your
        account.
      </Text>
      <Button href={url} style={styles.button}>
        Verify email
      </Button>
      <Text style={{ ...styles.text, marginTop: "16px" }}>
        Or copy this link into your browser:
      </Text>
      <Text style={styles.link}>{url}</Text>
    </EmailLayout>
  );
}

VerifyEmail.PreviewProps = {
  userName: "Ada",
  url: "https://example.com/verify?token=demo",
} satisfies VerifyEmailProps;

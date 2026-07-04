import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

const body = { backgroundColor: "#f4f4f5", fontFamily: "Helvetica, Arial, sans-serif", padding: "24px 0" };
const container = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "480px",
  padding: "32px",
};
const footer = { color: "#71717a", fontSize: "12px", marginTop: "24px", textAlign: "center" as const };

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section>{children}</Section>
        </Container>
        <Text style={footer}>You received this email because of your account on Industry App.</Text>
      </Body>
    </Html>
  );
}

export const styles = {
  heading: { color: "#18181b", fontSize: "20px", fontWeight: 700, margin: "0 0 16px" },
  text: { color: "#3f3f46", fontSize: "14px", lineHeight: "22px", margin: "0 0 16px" },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    padding: "12px 20px",
    textDecoration: "none",
  },
  link: { color: "#71717a", fontSize: "12px", wordBreak: "break-all" as const },
};

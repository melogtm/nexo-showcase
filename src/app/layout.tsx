import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexo",
  description: "Do CNIS aos cenários de aposentadoria, com cada número rastreável.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

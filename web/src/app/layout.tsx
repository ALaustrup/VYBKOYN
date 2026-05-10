import type { Metadata } from "next";
import { MandatoryUpdateGate } from "@/components/MandatoryUpdateGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "VYBKOY • KOYN",
  description: "High-fidelity crypto clicker · Base-ready",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MandatoryUpdateGate>{children}</MandatoryUpdateGate>
      </body>
    </html>
  );
}

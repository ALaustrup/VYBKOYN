import type { Metadata } from "next";
import { MandatoryUpdateGate } from "@/components/MandatoryUpdateGate";
import { Providers } from "@/providers/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "VYBKOYN",
  description: "Tap mining on Base — real on-chain rewards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <MandatoryUpdateGate>{children}</MandatoryUpdateGate>
        </Providers>
      </body>
    </html>
  );
}

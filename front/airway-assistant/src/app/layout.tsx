import type {
  Metadata,
  Viewport,
} from "next";

import "./globals.css";

import {
  BottomNav,
} from "@/components/app-shell/bottom-nav";

import {
  OperatorGate,
} from "@/components/app-shell/operator-gate";

import {
  ConnectivityProvider,
} from "@/components/connectivity/connectivity-provider";

import {
  AutoSyncManager,
} from "@/components/sync/auto-sync-manager";

import {
  ServiceWorkerRegister,
} from "@/components/pwa/service-worker-register";

export const metadata: Metadata = {
  title: {
    default:
      "Airway Imaging Assistant",

    template:
      "%s | Airway Imaging Assistant",
  },

  description:
    "Standardized mobile airway image capture and case collection",
};

export const viewport: Viewport = {
  width:
    "device-width",

  initialScale: 1,

  maximumScale: 1,

  viewportFit:
    "cover",

  themeColor:
    "#0369a1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
    >
      <body>
        <ServiceWorkerRegister />

        <ConnectivityProvider>
          <OperatorGate>
            <>
              <AutoSyncManager />

              <main
                className="
                  mx-auto
                  min-h-screen
                  max-w-md
                  bg-slate-50
                  pb-28
                "
              >
                {children}
              </main>

              <BottomNav />
            </>
          </OperatorGate>
        </ConnectivityProvider>
      </body>
    </html>
  );
}


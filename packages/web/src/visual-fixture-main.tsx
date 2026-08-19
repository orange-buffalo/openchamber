import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ChatSurfaceProvider } from "@openchamber/ui/components/chat/ChatSurfaceContext";
import { ThemeProvider } from "@openchamber/ui/components/providers/ThemeProvider";
import { TooltipProvider } from "@openchamber/ui/components/ui/tooltip";
import { RuntimeAPIProvider } from "@openchamber/ui/contexts/RuntimeAPIProvider";
import { ThemeSystemProvider } from "@openchamber/ui/contexts/ThemeSystemContext";
import { I18nProvider, initializeLocale } from "@openchamber/ui/lib/i18n";
import { opencodeClient } from "@openchamber/ui/lib/opencode/client";
import type { HostedSurface } from "@openchamber/ui/lib/runtimeSurface";
import { SyncProvider } from "@openchamber/ui/sync/sync-context";
import "@openchamber/ui/index.css";
import "@openchamber/ui/styles/fonts";

import { createConfiguredWebAPIs } from "./runtimeConfig";
import { VisualFixtureApp } from "./visual-fixtures/VisualFixtureApp";

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") ?? "";
const surface = params.get("surface");

if (surface !== "desktop" && surface !== "mobile") {
  throw new Error(`Unknown visual fixture surface: ${surface || "(missing)"}`);
}

window.__OPENCHAMBER_SURFACE__ = surface satisfies HostedSurface;
initializeLocale();

const root = document.getElementById("root");
if (!root) throw new Error("Visual fixture root not found");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ThemeSystemProvider>
        <ThemeProvider>
          <SyncProvider sdk={opencodeClient.getSdkClient()} directory="">
            <RuntimeAPIProvider apis={createConfiguredWebAPIs()}>
              <TooltipProvider delayDuration={300} skipDelayDuration={150}>
                <ChatSurfaceProvider mode="default">
                  <VisualFixtureApp scenario={scenario} surface={surface} />
                </ChatSurfaceProvider>
              </TooltipProvider>
            </RuntimeAPIProvider>
          </SyncProvider>
        </ThemeProvider>
      </ThemeSystemProvider>
    </I18nProvider>
  </StrictMode>,
);

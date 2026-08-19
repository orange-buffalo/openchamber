import { useEffect, useRef, useState } from "react";
import type { TextPart } from "@opencode-ai/sdk/v2";

import AssistantTextPart from "@openchamber/ui/components/chat/message/parts/AssistantTextPart";

import { SidebarProjectsFixture } from "./sidebarProjectsFixture";

type VisualSurface = "desktop" | "mobile";

const assistantResponse: TextPart = {
  id: "part_visual_assistant_response",
  sessionID: "session_visual_fixture",
  messageID: "message_visual_assistant",
  type: "text",
  text: `## Implementation complete

The response renderer now handles a realistic mix of content using the **production Markdown pipeline**.

- Deterministic fixture data
- Responsive desktop and mobile layouts
- Syntax-highlighted code without a model request

| Surface | Viewport | Status |
| --- | ---: | --- |
| Desktop | 1440 x 900 | Ready |
| Mobile | 390 x 844 | Ready |

Inline values such as \`session.status\` remain readable, while fenced code keeps its structure:

\`\`\`ts
const evidence = await capture({
  scenario: 'assistant-response',
  surfaces: ['desktop', 'mobile'],
});
\`\`\`

> This state is fully controlled: it needs no credentials, backend, or live AI response.`,
  time: {
    start: 1_700_000_000_000,
    end: 1_700_000_001_000,
  },
};

const scenarios = {
  "assistant-response": {
    title: "Assistant response",
    chrome: true as const,
    readySelector: "[data-markdown-content]",
    render: () => (
      <AssistantTextPart
        part={assistantResponse}
        sessionId={assistantResponse.sessionID}
        messageId={assistantResponse.messageID}
        streamPhase="completed"
        chatRenderMode="sorted"
      />
    ),
  },
  "sidebar-projects": {
    title: "Session sidebar projects",
    chrome: false as const,
    // Group bodies are the last thing the project zones render.
    readySelector: ".oc-group",
    render: () => <SidebarProjectsFixture />,
  },
};

const visualFixtureExists = (
  scenario: string,
): scenario is keyof typeof scenarios => Object.hasOwn(scenarios, scenario);

export function VisualFixtureApp({
  scenario,
  surface,
}: {
  scenario: string;
  surface: VisualSurface;
}) {
  if (!visualFixtureExists(scenario)) {
    throw new Error(
      `Unknown visual fixture scenario: ${scenario || "(missing)"}`,
    );
  }
  const fixture = scenarios[scenario];
  const contentRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (content.querySelector(fixture.readySelector)) {
      setReady(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (!content.querySelector(fixture.readySelector)) return;
      setReady(true);
      observer.disconnect();
    });
    observer.observe(content, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [fixture.readySelector, scenario]);

  // Chrome-less scenarios render a real product surface (a sidebar, a panel)
  // that owns its own width and background; the captioned card would misframe
  // it and change the very spacing under review.
  if (!fixture.chrome) {
    return (
      <main
        className="flex min-h-dvh items-start bg-background text-foreground"
        data-visual-fixture={scenario}
        data-visual-surface={surface}
        data-visual-fixture-ready={ready ? "" : undefined}
      >
        <div ref={contentRef}>{fixture.render()}</div>
      </main>
    );
  }

  return (
    <main
      className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-8 sm:py-12"
      data-visual-fixture={scenario}
      data-visual-surface={surface}
      data-visual-fixture-ready={ready ? "" : undefined}
    >
      <section className="mx-auto w-full max-w-3xl">
        <header className="mb-6 border-b border-border pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            OpenChamber visual fixture
          </p>
          <h1 className="mt-2 text-lg font-semibold">{fixture.title}</h1>
        </header>
        <div
          ref={contentRef}
          className="message-content-text overflow-hidden text-foreground/90"
        >
          {fixture.render()}
        </div>
      </section>
    </main>
  );
}

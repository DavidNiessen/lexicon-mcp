import { expect, it } from "vitest";
import { fixture } from "./ui-fixture.js";

it("applies the initial host color scheme and light-dark tokens without calling library tools", async () => {
  const f = fixture();
  await f.ready({
    theme: "dark",
    styles: {
      variables: {
        "--color-text-primary": "light-dark(#202020, #f5f5f5)",
        "--color-background-primary": "light-dark(#ffffff, #1b1b1b)",
        "--color-border-primary": "light-dark(#dddddd, #444444)",
        "--font-sans": "Arial, sans-serif",
      },
    },
  });
  const root = f.document.documentElement;
  expect(root.dataset.theme).toBe("dark");
  expect(root.style.getPropertyValue("color-scheme")).toBe("dark");
  expect(root.style.getPropertyValue("--color-text-primary")).toBe(
    "light-dark(#202020, #f5f5f5)",
  );
  expect(root.style.getPropertyValue("--font-sans")).toBe("Arial, sans-serif");
  expect(f.messages.some((message) => message.method === "tools/call")).toBe(
    false,
  );
});

it("preserves host tokens on theme-only updates and applies partial token changes", async () => {
  const f = fixture();
  await f.ready({
    theme: "dark",
    styles: {
      variables: { "--color-text-primary": "light-dark(#111111, #eeeeee)" },
    },
  });
  f.send({
    jsonrpc: "2.0",
    method: "ui/notifications/host-context-changed",
    params: { theme: "light" },
  });
  const root = f.document.documentElement;
  expect(root.dataset.theme).toBe("light");
  expect(root.style.getPropertyValue("color-scheme")).toBe("light");
  expect(root.style.getPropertyValue("--color-text-primary")).toBe(
    "light-dark(#111111, #eeeeee)",
  );
  f.send({
    jsonrpc: "2.0",
    method: "ui/notifications/host-context-changed",
    params: { styles: { variables: { "--color-border-primary": "#999999" } } },
  });
  expect(root.style.getPropertyValue("--color-border-primary")).toBe("#999999");
  expect(root.style.getPropertyValue("color-scheme")).toBe("light");
  expect(f.messages.some((message) => message.method === "tools/call")).toBe(
    false,
  );
});

it("uses the same host token and scheme handling for delayed OpenAI globals", () => {
  const f = fixture();
  f.window.openai = { callTool: async () => ({}) };
  f.globals({
    theme: "dark",
    styles: { variables: { "--color-text-secondary": "#b8b8b8" } },
  });
  const root = f.document.documentElement;
  expect(root.style.getPropertyValue("color-scheme")).toBe("dark");
  expect(root.style.getPropertyValue("--color-text-secondary")).toBe("#b8b8b8");
  expect(f.messages.some((message) => message.method === "tools/call")).toBe(
    false,
  );
});

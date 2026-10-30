import { expect, it } from "vitest";
import { fixture, model } from "./ui-fixture.js";

it.each([{}, { serverTools: {} }, { serverTools: null }])(
  "displays the same read-only preview for host capabilities %j",
  async (capabilities) => {
    const f = fixture();
    await f.ready({ theme: "dark" }, capabilities);
    f.result();
    expect(f.elements.get("title")!.textContent).toBe(model.title);
    expect(f.elements.get("preview")!.textContent).toContain("Industrial");
    expect(f.elements.get("note")!.textContent).toContain(
      "native approval controls",
    );
    expect(f.elements.get("note")!.textContent).toContain("confirm in chat");
    expect(f.elements.has("approval-controls")).toBe(false);
    expect(
      f.messages.some(
        (message) =>
          message.method === "tools/call" || message.method === "ui/message",
      ),
    ).toBe(false);
  },
);

it("initializes only display capabilities and does not request server tool forwarding", () => {
  const f = fixture();
  const init = f.messages.find((message) => message.method === "ui/initialize");
  expect(init.params.appCapabilities).toEqual({});
  expect(init.params.protocolVersion).toBe("2026-01-26");
  expect(
    f.messages.filter((message) => message.method === "ui/initialize"),
  ).toHaveLength(1);
});

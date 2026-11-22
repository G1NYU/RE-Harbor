import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { JSDOM } from "jsdom";
import { DmReactionPicker } from "@/components/dm/dm-reaction-picker";
import { DmThread } from "@/components/dm/dm-thread";

test("reactions render outside the scrolling conversation and close after selection, outside click and Escape", async () => {
  const dom = new JSDOM(
    "<div id='chat'><div id='root'></div></div><button id='outside'>Outside</button>",
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const selected: string[] = [];
  try {
    await React.act(() =>
      root.render(<DmReactionPicker onPick={(emoji) => selected.push(emoji)} />),
    );
    const trigger = document.querySelector<HTMLButtonElement>("#root button")!;
    const open = async () => {
      await React.act(() => trigger.click());
    };
    await open();
    const picker = document.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.ok(picker);
    assert.equal(picker.parentElement, document.body, "the menu cannot widen the chat scroller");
    assert.equal(document.getElementById("chat")!.querySelector('[role="dialog"]'), null);
    assert.equal(picker.querySelectorAll("button").length, 6);
    assert.equal(document.activeElement, picker.querySelector("button"));
    await React.act(() => picker.querySelector<HTMLButtonElement>("button")!.click());
    assert.deepEqual(selected, ["👍"]);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
    await open();
    await React.act(() =>
      document
        .getElementById("outside")!
        .dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })),
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await open();
    await React.act(() =>
      document.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});

test("saved reactions sit outside an outgoing message's colored bubble", async (t) => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      messages: [
        {
          id: "fixture-message",
          conversationId: "fixture-thread",
          body: "Outgoing fixture message",
          at: "2026-11-19T00:00:00Z",
          mine: true,
          sender: null,
          reactions: [{ emoji: "👍", count: 1, mine: true }],
        },
      ],
      total: 1,
    }),
  );
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  try {
    await React.act(async () => {
      root.render(
        <DmThread conversationId="fixture-thread" onBack={() => {}} onClose={() => {}} />,
      );
    });
    await React.act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
    const body = [...document.querySelectorAll("p")].find(
      (element) => element.textContent === "Outgoing fixture message",
    )!;
    const reaction = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "👍",
    )!;
    assert.ok(body && reaction, document.body.textContent ?? "empty page");
    assert.ok(body.parentElement!.classList.contains("bg-accent"));
    assert.equal(body.parentElement!.contains(reaction), false);
    assert.ok(reaction.classList.contains("bg-elevated"));
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});

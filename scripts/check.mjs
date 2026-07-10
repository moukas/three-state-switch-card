import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const file = resolve(import.meta.dirname, "..", "dist", "three-state-switch-card.js");
const code = await readFile(file, "utf8");

const timeouts = [];
const clearCalls = [];
const bodyEvents = [];

class BaseElement {
  constructor() {
    this.shadowRoot = null;
    this.isConnected = false;
    this.dispatchedEvents = [];
  }

  attachShadow() {
    this.shadowRoot = {
      innerHTML: "",
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    return this.shadowRoot;
  }

  dispatchEvent(event) {
    this.dispatchedEvents.push(event);
    return true;
  }
}

class CustomEventStub {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
    this.bubbles = init.bubbles;
    this.composed = init.composed;
    this.cancelable = init.cancelable;
  }
}

const context = {
  console: {
    ...console,
    info() {},
  },
  HTMLElement: BaseElement,
  CustomEvent: CustomEventStub,
  document: {
    body: {
      dispatchEvent(event) {
        bodyEvents.push(event);
      },
    },
    createElement(tag) {
      const ctor = context.customElements.get(tag);
      return ctor ? new ctor() : { tagName: tag };
    },
  },
  window: {
    customCards: [],
    confirm() {
      return true;
    },
  },
  customElements: {
    registry: new Map(),
    get(name) {
      return this.registry.get(name);
    },
    define(name, cls) {
      this.registry.set(name, cls);
    },
    whenDefined() {
      return Promise.resolve();
    },
  },
  queueMicrotask(fn) {
    fn();
  },
  setTimeout(fn, delay) {
    const handle = { fn, delay };
    timeouts.push(handle);
    return handle;
  },
  clearTimeout(handle) {
    clearCalls.push(handle);
  },
};

vm.createContext(context);
new vm.Script(code, { filename: file }).runInContext(context);

const Card = context.customElements.get("three-state-switch-card");
const Editor = context.customElements.get("three-state-switch-card-editor");

assert.ok(Card, "Card custom element was not registered.");
assert.ok(Editor, "Editor custom element was not registered.");

const metadata = context.window.customCards.find((item) => item.type === "three-state-switch-card");
assert.ok(metadata, "Card metadata was not registered.");
assert.equal(metadata.name, "Three State Switch Card");
assert.match(metadata.description, /three-position switch card/i);

const card = new Card();

assert.throws(() => card.setConfig(), /Card configuration is required/);
assert.throws(() => card.setConfig({}), /entity field is required/);
assert.throws(() => card.setConfig({ entity: "light.demo" }), /Only input_select and select entities are supported/);
assert.throws(() => card.setConfig({ entity: "input_select.demo", variant: "glass" }), /variant must be default or minimal/);
assert.throws(
  () => card.setConfig({ entity: "input_select.demo", options: [{ value: "1" }, { value: "2" }] }),
  /options must contain exactly three items/
);

card.setConfig({ entity: "input_select.demo", optimistic: true });
card.hass = {
  states: {
    "input_select.demo": {
      state: "Auto",
      attributes: {
        options: ["On", "Auto", "Off"],
        friendly_name: "Demo Mode",
      },
    },
  },
  callService: async (...args) => {
    card._serviceCall = args;
  },
};

await card._selectIndex(0, [
  { value: "On", label: "On", icon: "mdi:power", color: "" },
  { value: "Auto", label: "Auto", icon: "mdi:autorenew", color: "" },
  { value: "Off", label: "Off", icon: "mdi:power-off", color: "" },
]);

assert.equal(
  JSON.stringify(card._serviceCall),
  JSON.stringify([
    "input_select",
    "select_option",
    { entity_id: "input_select.demo", option: "On" },
  ])
);
assert.equal(card._pendingValue, "On");
assert.equal(timeouts.at(-1)?.delay, 4000);
assert.equal(bodyEvents.at(-1)?.type, "haptic");
assert.ok(card.dispatchedEvents.some((event) => event.type === "three-state-change"));

card.hass = {
  states: {
    "input_select.demo": {
      state: "On",
      attributes: {
        options: ["On", "Auto", "Off"],
      },
    },
  },
};
assert.equal(card._pendingValue, "");
assert.ok(clearCalls.length > 0, "Pending timeout should be cleared when state catches up.");
assert.equal(card._lastStableValue, "On");
assert.equal(card._history.length, 2);
assert.equal(card._history[0].value, "On");
assert.equal(card._history[1].value, "Auto");
assert.equal(
  card._resolveCurrentIndex(
    [
      { value: "On", label: "On", icon: "mdi:power", color: "" },
      { value: "Auto", label: "Auto", icon: "mdi:autorenew", color: "" },
      { value: "Off", label: "Off", icon: "mdi:power-off", color: "" },
    ],
    "transient"
  ),
  0,
  "Transient states should keep the last stable position instead of jumping to fallback."
);

card.isConnected = true;
const animationTargets = [];
card.shadowRoot = {
  innerHTML: "",
  querySelector(selector) {
    if (![".thumb", ".thumb-icon"].includes(selector)) return null;
    return {
      animate() {
        animationTargets.push(selector);
      },
    };
  },
  querySelectorAll() {
    return [];
  },
};
card._render();
assert.match(
  card.shadowRoot.innerHTML,
  /thumb-icon" icon="mdi:power"/,
  "The active icon should be rendered inside the thumb."
);

card._pendingValue = "Off";
card._render();
assert.match(
  card.shadowRoot.innerHTML,
  /thumb-icon" icon="mdi:power-off"/,
  "The optimistic target icon should be rendered inside the thumb."
);
assert.ok(animationTargets.includes(".thumb-icon"), "State changes should animate only the thumb icon.");
assert.ok(!animationTargets.includes(".thumb"), "State changes must not animate the positioned thumb.");

const historyCard = new Card();
historyCard.setConfig({ entity: "input_select.demo", show_history: true, history_limit: 2 });
historyCard.isConnected = true;
historyCard.shadowRoot = {
  innerHTML: "",
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
historyCard.hass = {
  states: {
    "input_select.demo": {
      state: "On",
      attributes: { options: ["On", "Auto", "Off"] },
    },
  },
};
historyCard.hass = {
  states: {
    "input_select.demo": {
      state: "Off",
      attributes: { options: ["On", "Auto", "Off"] },
    },
  },
};
historyCard.hass = {
  states: {
    "input_select.demo": {
      state: "Auto",
      attributes: { options: ["On", "Auto", "Off"] },
    },
  },
};
assert.equal(historyCard._history.length, 2);
assert.equal(historyCard._history[0].value, "Auto");
assert.equal(historyCard._history[1].value, "Off");
historyCard._render();
assert.match(historyCard.shadowRoot.innerHTML, /class="history"/);

const minimalCard = new Card();
minimalCard.setConfig({ entity: "input_select.demo", variant: "minimal", orientation: "horizontal" });
minimalCard.isConnected = true;
minimalCard.shadowRoot = {
  innerHTML: "",
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
minimalCard.hass = {
  states: {
    "input_select.demo": {
      state: "Auto",
      attributes: { options: ["On", "Auto", "Off"] },
    },
  },
};
minimalCard._render();
assert.match(minimalCard.shadowRoot.innerHTML, /ha-card\s+class="minimal/);

const failingCard = new Card();
failingCard.setConfig({ entity: "select.demo", optimistic: true, haptic: false });
failingCard._hass = {
  states: {
    "select.demo": {
      state: "automatic",
      attributes: {
        options: ["force_on", "automatic", "force_off"],
      },
    },
  },
  callService: async () => {
    throw new Error("boom");
  },
};

await failingCard._selectIndex(0, [
  { value: "force_on", label: "On", icon: "mdi:power", color: "" },
  { value: "automatic", label: "Auto", icon: "mdi:autorenew", color: "" },
  { value: "force_off", label: "Off", icon: "mdi:power-off", color: "" },
]);

assert.equal(failingCard._pendingValue, "");
assert.ok(
  failingCard.dispatchedEvents.some(
    (event) => event.type === "hass-notification" && /Failed to set On: boom/.test(event.detail.message)
  ),
  "Failure path should emit a Home Assistant notification event."
);

const stub = Card.getStubConfig(
  {
    states: {
      "light.invalid": {},
      "select.demo": {},
    },
  },
  [],
  []
);
assert.equal(stub.entity, "select.demo");

assert.equal(metadata.getEntitySuggestion(
  {
    states: {
      "select.demo": {
        attributes: { options: ["a", "b", "c"] },
      },
    },
  },
  "select.demo"
)?.config?.entity, "select.demo");

assert.equal(
  metadata.getEntitySuggestion(
    {
      states: {
        "select.invalid": {
          attributes: { options: ["a", "b"] },
        },
      },
    },
    "select.invalid"
  ),
  null
);

const editor = new Editor();
editor.setConfig({ entity: "input_select.demo", variant: "minimal" });
assert.match(editor.shadowRoot.innerHTML, /<select data-key="variant">/);
assert.match(editor.shadowRoot.innerHTML, />Minimal</);

console.log("Behavioral checks passed.");

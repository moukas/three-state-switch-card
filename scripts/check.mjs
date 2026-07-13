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
assert.throws(() => card.setConfig({}), /Either entity or state_entity with auto_entity is required/);
assert.throws(() => card.setConfig({ entity: "light.demo" }), /Only input_select and select entities are supported/);
assert.throws(() => card.setConfig({ entity: "input_select.demo", variant: "glass" }), /variant must be default or minimal/);
assert.throws(() => card.setConfig({ entity: "input_select.demo", history_hours: 0 }), /history_hours must be an integer/);
assert.throws(
  () => card.setConfig({ entity: "input_select.demo", dialog_orientation: "diagonal" }),
  /dialog_orientation must be vertical or horizontal/
);
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

const booleanCard = new Card();
booleanCard.setConfig({
  state_entity: "binary_sensor.demo_active",
  auto_entity: "input_boolean.demo_auto",
  manual_entity: "input_boolean.demo_manual",
  optimistic: false,
});
booleanCard.hass = {
  states: {
    "binary_sensor.demo_active": { state: "off", attributes: { friendly_name: "Demo active" } },
    "input_boolean.demo_auto": { state: "on", attributes: { friendly_name: "Demo auto" } },
    "input_boolean.demo_manual": { state: "off", attributes: { friendly_name: "Demo manual" } },
  },
  callService: async (...args) => {
    booleanCard._serviceCalls = [...(booleanCard._serviceCalls || []), args];
  },
};
assert.equal(booleanCard._currentValue(), "Auto");
await booleanCard._selectIndex(0, booleanCard._options());
assert.equal(
  JSON.stringify(booleanCard._serviceCalls),
  JSON.stringify([
    ["homeassistant", "turn_off", { entity_id: "input_boolean.demo_auto" }],
    ["homeassistant", "turn_on", { entity_id: "input_boolean.demo_manual" }],
  ])
);

const booleanLabelsCard = new Card();
booleanLabelsCard.setConfig({
  state_entity: "binary_sensor.demo_active",
  auto_entity: "input_boolean.demo_auto",
  manual_entity: "input_boolean.demo_manual",
  options: [
    { value: "Zapnuto", label: "Zapnuto", icon: "mdi:lightbulb-on", color: "#44aa44" },
    { value: "Automatika", label: "Automatika", icon: "mdi:autorenew", color: "#03a9f4" },
    { value: "Vypnuto", label: "Vypnuto", icon: "mdi:lightbulb-off", color: "#777777" },
  ],
});
const booleanLabels = booleanLabelsCard._options();
assert.equal(JSON.stringify(booleanLabels.map((option) => option.value)), JSON.stringify(["On", "Auto", "Off"]));
assert.equal(JSON.stringify(booleanLabels.map((option) => option.label)), JSON.stringify(["Zapnuto", "Automatika", "Vypnuto"]));
assert.equal(booleanLabels[0].icon, "mdi:lightbulb-on");

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

const horizontalCard = new Card();
horizontalCard.setConfig({ entity: "input_select.demo", orientation: "horizontal" });
horizontalCard.isConnected = true;
horizontalCard.shadowRoot = {
  innerHTML: "",
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
horizontalCard.hass = {
  states: {
    "input_select.demo": {
      state: "Auto",
      attributes: { options: ["On", "Auto", "Off"] },
    },
  },
};
assert.match(horizontalCard.shadowRoot.innerHTML, /class="control-wrap horizontal/);
assert.match(horizontalCard.shadowRoot.innerHTML, /class="control horizontal/);
assert.match(horizontalCard.shadowRoot.innerHTML, /class="labels horizontal"/);

const moreInfoCard = new Card();
moreInfoCard.setConfig({
  entity: "input_select.demo",
  actual_state_entity: "binary_sensor.demo_active",
  history_limit: 2,
});
moreInfoCard.isConnected = true;
let historyActionClick;
moreInfoCard.shadowRoot = {
  innerHTML: "",
  querySelector(selector) {
    if (selector === ".history-action") {
      return {
        addEventListener(type, handler) {
          if (type === "click") historyActionClick = handler;
        },
      };
    }
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
const dialogApiCalls = [];
moreInfoCard.hass = {
  callApi: async (method, path) => {
    dialogApiCalls.push({ method, path });
    if (path.startsWith("history/period/") && path.includes("filter_entity_id=input_select.demo")) {
      return [[
        { state: "On", last_changed: "2026-07-10T10:00:00.000Z" },
        { state: "Auto", last_changed: "2026-07-10T11:00:00.000Z" },
      ]];
    }
    if (path.startsWith("history/period/") && path.includes("filter_entity_id=binary_sensor.demo_active")) {
      return [[
        { state: "off", last_changed: "2026-07-10T10:00:00.000Z" },
        { state: "on", last_changed: "2026-07-10T11:00:00.000Z" },
      ]];
    }
    if (path.startsWith("logbook/")) {
      return [
        { name: "Demo Mode", message: "changed to Auto", when: "2026-07-10T11:00:00.000Z" },
        { name: "Demo Active", message: "turned on", when: "2026-07-10T11:01:00.000Z" },
      ];
    }
    return [];
  },
  states: {
    "input_select.demo": {
      state: "Auto",
      attributes: { options: ["On", "Auto", "Off"] },
    },
    "binary_sensor.demo_active": {
      state: "on",
      attributes: { friendly_name: "Demo active" },
    },
  },
};
assert.match(moreInfoCard.shadowRoot.innerHTML, /class="history-action"/);
assert.match(moreInfoCard.shadowRoot.innerHTML, /icon="mdi:chart-line"/);
historyActionClick?.({ stopPropagation() {} });
await Promise.resolve();
await Promise.resolve();
assert.equal(moreInfoCard._historyDialogOpen, true);
assert.match(moreInfoCard.shadowRoot.innerHTML, /class="history-dialog-backdrop"/);
assert.match(moreInfoCard.shadowRoot.innerHTML, /Skutečný stav/);
assert.match(moreInfoCard.shadowRoot.innerHTML, /Režim řízení/);
assert.match(moreInfoCard.shadowRoot.innerHTML, /Aktivita/);
assert.ok(
  dialogApiCalls.some(
    (call) => call.method === "GET" &&
      call.path.startsWith("history/period/") &&
      call.path.includes("filter_entity_id=input_select.demo")
  )
);
assert.ok(
  dialogApiCalls.some(
    (call) => call.method === "GET" &&
      call.path.startsWith("history/period/") &&
      call.path.includes("filter_entity_id=binary_sensor.demo_active")
  )
);
assert.ok(dialogApiCalls.some((call) => call.method === "GET" && call.path.startsWith("logbook/")));
assert.ok(dialogApiCalls.some((call) => call.path.includes("binary_sensor.demo_active")));
assert.ok(
  !moreInfoCard.dispatchedEvents.some((event) => event.type === "hass-more-info"),
  "Clicking the history action must not open the standard entity controls."
);

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
      attributes: { options: ["On", "Auto", "Off"], icon: "mdi:fridge" },
    },
  },
};
assert.equal(historyCard._history.length, 2);
assert.equal(historyCard._history[0].value, "Auto");
assert.equal(historyCard._history[1].value, "Off");
historyCard._render();
assert.match(historyCard.shadowRoot.innerHTML, /class="history"/);

const recorderHistoryCard = new Card();
recorderHistoryCard.setConfig({ entity: "input_select.demo", show_history: true, history_hours: 6, history_limit: 2 });
recorderHistoryCard.isConnected = true;
recorderHistoryCard.shadowRoot = {
  innerHTML: "",
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
recorderHistoryCard._hass = {
  callApi: async (method, path) => {
    recorderHistoryCard._historyCall = { method, path };
    return [[
      { state: "On", last_changed: "2026-07-10T10:00:00.000Z" },
      { s: "Auto", lu: 1783677600 },
      { s: "Off", lc: 1783681200 },
    ]];
  },
};
await recorderHistoryCard._fetchHistory(
  [
    { value: "On", label: "On", icon: "mdi:power", color: "#43a047" },
    { value: "Auto", label: "Auto", icon: "mdi:autorenew", color: "#03a9f4" },
    { value: "Off", label: "Off", icon: "mdi:power-off", color: "#757575" },
  ],
  "Off",
  "input_select.demo|6"
);
assert.equal(recorderHistoryCard._historyCall.method, "GET");
assert.match(recorderHistoryCard._historyCall.path, /^history\/period\//);
assert.match(recorderHistoryCard._historyCall.path, /filter_entity_id=input_select\.demo/);
assert.match(recorderHistoryCard._historyCall.path, /minimal_response/);
recorderHistoryCard._renderHistory([
  { value: "On", label: "On", icon: "mdi:power", color: "#43a047" },
  { value: "Auto", label: "Auto", icon: "mdi:autorenew", color: "#03a9f4" },
  { value: "Off", label: "Off", icon: "mdi:power-off", color: "#757575" },
]);
assert.match(recorderHistoryCard._renderHistory([
  { value: "On", label: "On", icon: "mdi:power", color: "#43a047" },
  { value: "Auto", label: "Auto", icon: "mdi:autorenew", color: "#03a9f4" },
  { value: "Off", label: "Off", icon: "mdi:power-off", color: "#757575" },
]), /class="history-chart"/);
assert.match(recorderHistoryCard._renderHistory([
  { value: "On", label: "On", icon: "mdi:power", color: "#43a047" },
  { value: "Auto", label: "Auto", icon: "mdi:autorenew", color: "#03a9f4" },
  { value: "Off", label: "Off", icon: "mdi:power-off", color: "#757575" },
]), /class="history-segment"/);

const minimalCard = new Card();
minimalCard.setConfig({
  state_entity: "binary_sensor.demo_active",
  auto_entity: "input_boolean.demo_auto",
  manual_entity: "input_boolean.demo_manual",
  variant: "minimal",
  orientation: "horizontal",
  show_history: true,
});
minimalCard.isConnected = true;
let minimalSummaryClick;
let minimalDialogHistoryClick;
minimalCard.shadowRoot = {
  innerHTML: "",
  querySelector(selector) {
    if (selector === ".minimal-summary") {
      return {
        addEventListener(type, handler) {
          if (type === "click") minimalSummaryClick = handler;
        },
      };
    }
    if (selector === ".dialog-history-action") {
      return {
        addEventListener(type, handler) {
          if (type === "click") minimalDialogHistoryClick = handler;
        },
      };
    }
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
minimalCard.hass = {
  states: {
    "binary_sensor.demo_active": {
      state: "on",
      attributes: { friendly_name: "Demo active", icon: "mdi:fridge" },
    },
    "input_boolean.demo_auto": {
      state: "off",
      attributes: { friendly_name: "Demo auto" },
    },
    "input_boolean.demo_manual": {
      state: "on",
      attributes: { friendly_name: "Demo manual" },
    },
  },
};
minimalCard._render();
assert.match(minimalCard.shadowRoot.innerHTML, /ha-card\s+class="minimal/);
assert.match(minimalCard.shadowRoot.innerHTML, /class="minimal-row"/);
assert.match(minimalCard.shadowRoot.innerHTML, /class="minimal-summary"/);
assert.match(minimalCard.shadowRoot.innerHTML, /class="minimal-state-icon"/);
assert.match(minimalCard.shadowRoot.innerHTML, /icon="mdi:fridge"/);
assert.equal(minimalCard._currentValue(), "On");
assert.match(minimalCard.shadowRoot.innerHTML, /class="control horizontal inline"/);
assert.doesNotMatch(minimalCard.shadowRoot.innerHTML, /class="labels horizontal"/);
assert.doesNotMatch(minimalCard.shadowRoot.innerHTML, /class="history"/);
assert.doesNotMatch(minimalCard.shadowRoot.innerHTML, /minimal-expanded-control/);

minimalSummaryClick?.({ stopPropagation() {} });
assert.equal(minimalCard._dialogOpen, true);
minimalCard._render();
assert.match(minimalCard.shadowRoot.innerHTML, /class="dialog-backdrop"/);
assert.match(minimalCard.shadowRoot.innerHTML, /class="dialog-history-action"/);
assert.match(minimalCard.shadowRoot.innerHTML, /icon="mdi:chart-line"/);
assert.match(minimalCard.shadowRoot.innerHTML, /class="control-wrap vertical dialog-control/);
assert.match(minimalCard.shadowRoot.innerHTML, /class="control vertical dialog"/);
assert.match(minimalCard.shadowRoot.innerHTML, /class="labels vertical"/);
minimalDialogHistoryClick?.({ stopPropagation() {} });
assert.equal(minimalCard._dialogOpen, false);
assert.equal(minimalCard._historyDialogOpen, true);
assert.match(minimalCard.shadowRoot.innerHTML, /class="history-dialog-backdrop"/);

const horizontalDialogCard = new Card();
horizontalDialogCard.setConfig({
  state_entity: "binary_sensor.demo_active",
  auto_entity: "input_boolean.demo_auto",
  variant: "minimal",
  dialog_orientation: "horizontal",
});
horizontalDialogCard.isConnected = true;
horizontalDialogCard._dialogOpen = true;
horizontalDialogCard.shadowRoot = {
  innerHTML: "",
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
horizontalDialogCard.hass = minimalCard._hass;
horizontalDialogCard._render();
assert.match(horizontalDialogCard.shadowRoot.innerHTML, /class="control-wrap horizontal dialog-control/);
assert.match(horizontalDialogCard.shadowRoot.innerHTML, /class="control horizontal dialog"/);

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
assert.match(editor.shadowRoot.innerHTML, /data-key="dialog_orientation"/);
assert.match(editor.shadowRoot.innerHTML, /Expanded minimal dialog orientation/);

const booleanEditor = new Editor();
booleanEditor.setConfig({
  state_entity: "binary_sensor.demo_active",
  auto_entity: "input_boolean.demo_auto",
  options: [{ label: "Zapnuto" }, { label: "Automatika" }, { label: "Vypnuto" }],
});
assert.match(booleanEditor.shadowRoot.innerHTML, /State labels, icons, and colors/);
assert.match(booleanEditor.shadowRoot.innerHTML, /fixed internal values On, Auto, and Off/);
assert.match(booleanEditor.shadowRoot.innerHTML, /value="On"\s+disabled/);
assert.match(booleanEditor.shadowRoot.innerHTML, /value="Zapnuto"/);

console.log("Behavioral checks passed.");

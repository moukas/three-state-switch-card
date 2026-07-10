/**
 * Three State Switch Card
 * A dependency-free Home Assistant Lovelace card for input_select/select entities.
 *
 * @license MIT
 */
const CARD_VERSION = "0.1.0";
const CARD_TAG = "three-state-switch-card";
const EDITOR_TAG = "three-state-switch-card-editor";
const SUPPORTED_DOMAINS = new Set(["input_select", "select"]);
const FALLBACK_NAME = "Three State Switch";
const DEFAULT_LABELS = ["On", "Auto", "Off"];
const DEFAULT_ICONS = ["mdi:power", "mdi:autorenew", "mdi:power-off"];
const PENDING_TIMEOUT_MS = 4000;

const DEFAULTS = Object.freeze({
  name: "",
  subtitle: "",
  variant: "default",
  orientation: "vertical",
  reverse: false,
  show_name: true,
  show_subtitle: true,
  show_labels: true,
  compact: false,
  interaction: "tap-drag",
  haptic: true,
  confirm: false,
  disabled: false,
  optimistic: true,
  show_history: false,
  history_limit: 5,
  options: [],
});

function fireEvent(node, type, detail = {}, options = {}) {
  const event = new CustomEvent(type, {
    detail,
    bubbles: options.bubbles ?? true,
    composed: options.composed ?? true,
    cancelable: options.cancelable ?? false,
  });
  node.dispatchEvent(event);
  return event;
}

function domainOf(entityId = "") {
  return String(entityId).split(".", 1)[0];
}

function normalizeOption(option, index) {
  if (typeof option === "string") {
    return {
      value: option,
      label: option,
      icon: DEFAULT_ICONS[index] ?? "mdi:circle",
      color: "",
    };
  }
  return {
    value: String(option?.value ?? ""),
    label: String(option?.label ?? option?.value ?? ""),
    icon: String(option?.icon ?? DEFAULT_ICONS[index] ?? "mdi:circle"),
    color: String(option?.color ?? ""),
  };
}

function deriveOptions(config, stateObj) {
  const explicit = Array.isArray(config.options) ? config.options : [];
  let result = explicit.map(normalizeOption).filter((item) => item.value);

  if (!result.length) {
    const values = Array.isArray(stateObj?.attributes?.options)
      ? stateObj.attributes.options.slice(0, 3)
      : [];
    result = values.map((value, index) => ({
      value: String(value),
      label: DEFAULT_LABELS[index] ?? String(value),
      icon: DEFAULT_ICONS[index] ?? "mdi:circle",
      color: "",
    }));
  }

  if (config.reverse) result.reverse();
  return result.slice(0, 3);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function optionIndex(options, value) {
  const index = options.findIndex((item) => item.value === value);
  return index < 0 ? 1 : index;
}

function findOptionIndex(options, value) {
  return options.findIndex((item) => item.value === value);
}

function displayName(hass, config, stateObj) {
  if (config.name) return config.name;
  if (hass?.formatEntityName && config.entity) {
    try {
      return hass.formatEntityName(stateObj, "entity");
    } catch (_) {
      // Fall through for older HA versions.
    }
  }
  return stateObj?.attributes?.friendly_name ?? config.entity ?? FALLBACK_NAME;
}

function haptic(type = "selection") {
  fireEvent(document.body, "haptic", type);
}

function formatHistoryTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

class ThreeStateSwitchCard extends HTMLElement {
  static async getConfigElement() {
    await customElements.whenDefined(EDITOR_TAG);
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig(hass, entities = [], entitiesFallback = []) {
    const candidates = [...entities, ...entitiesFallback];
    const entity = candidates.find((id) => SUPPORTED_DOMAINS.has(domainOf(id))) ??
      Object.keys(hass?.states ?? {}).find((id) => SUPPORTED_DOMAINS.has(domainOf(id))) ??
      "input_select.mode";
    return { entity, orientation: "vertical" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this._config = undefined;
    this._pendingValue = "";
    this._pendingTimer = 0;
    this._pointer = null;
    this._lastStableValue = "";
    this._lastObservedValue = "";
    this._history = [];
    this._lastRenderedState = "";
    this._renderQueued = false;
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Card configuration is required.");
    if (!config.entity) throw new Error("The entity field is required.");
    if (!SUPPORTED_DOMAINS.has(domainOf(config.entity))) {
      throw new Error("Only input_select and select entities are supported.");
    }

    const merged = { ...DEFAULTS, ...config };
    if (!["default", "minimal"].includes(merged.variant)) {
      throw new Error("variant must be default or minimal.");
    }
    if (!["vertical", "horizontal"].includes(merged.orientation)) {
      throw new Error("orientation must be vertical or horizontal.");
    }
    if (!["tap", "tap-drag"].includes(merged.interaction)) {
      throw new Error("interaction must be tap or tap-drag.");
    }
    if (!Number.isInteger(merged.history_limit) || merged.history_limit < 1 || merged.history_limit > 20) {
      throw new Error("history_limit must be an integer between 1 and 20.");
    }
    if (Array.isArray(merged.options) && merged.options.length && merged.options.length !== 3) {
      throw new Error("options must contain exactly three items.");
    }

    this._config = merged;
    this._clearPending();
    this._queueRender();
  }

  set hass(value) {
    this._hass = value;
    const actual = value?.states?.[this._config?.entity]?.state;
    if (this._pendingValue && actual === this._pendingValue) this._clearPending();
    const options = deriveOptions(this._config ?? DEFAULTS, value?.states?.[this._config?.entity]);
    const actualIndex = findOptionIndex(options, actual);
    if (actualIndex >= 0) {
      this._lastStableValue = actual;
      this._recordHistory(options[actualIndex]);
    }
    this._queueRender();
  }

  getCardSize() {
    return this._config?.orientation === "horizontal" ? 3 : 6;
  }

  getGridOptions() {
    if (this._config?.orientation === "horizontal") {
      return { rows: 3, columns: 6, min_rows: 3, min_columns: 3 };
    }
    return { rows: 6, columns: 3, min_rows: 5, min_columns: 3 };
  }

  connectedCallback() {
    this._queueRender();
  }

  disconnectedCallback() {
    this._clearPending();
    this._pointer = null;
  }

  _clearPending() {
    this._pendingValue = "";
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = 0;
    }
  }

  _armPendingTimeout(expectedLabel) {
    if (!this._config?.optimistic) return;
    if (this._pendingTimer) clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => {
      if (!this._pendingValue) return;
      this._clearPending();
      this._queueRender();
      fireEvent(this, "hass-notification", {
        message: `State update for ${expectedLabel} timed out.`,
      });
    }, PENDING_TIMEOUT_MS);
  }

  _queueRender() {
    if (!this.isConnected || this._renderQueued) return;
    this._renderQueued = true;
    queueMicrotask(() => {
      this._renderQueued = false;
      this._render();
    });
  }

  _render() {
    if (!this._config || !this._hass) return;

    const stateObj = this._hass.states?.[this._config.entity];
    const unavailable = !stateObj || ["unavailable", "unknown"].includes(stateObj.state);
    const options = deriveOptions(this._config, stateObj);
    const invalidOptions = options.length !== 3;
    const currentValue = this._pendingValue || stateObj?.state || "";
    const currentIndex = this._resolveCurrentIndex(options, currentValue);
    const current = options[currentIndex] ?? { value: "", label: "Unknown state", icon: "mdi:help" };
    const disabled = Boolean(this._config.disabled || unavailable || invalidOptions);
    const name = displayName(this._hass, this._config, stateObj);
    const subtitle = this._config.subtitle ||
      (unavailable ? "Entity unavailable" :
       invalidOptions ? "Entity must expose exactly three options" :
       current.label);

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card
        class="${escapeHtml(this._config.variant)} ${this._config.compact ? "compact" : ""} ${disabled ? "disabled" : ""}"
        aria-disabled="${disabled}"
      >
        <div class="header">
          ${this._config.show_name ? `<div class="title">${escapeHtml(name)}</div>` : ""}
          ${this._config.show_subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
        </div>

        <div class="control-wrap">
          <div
            class="control ${escapeHtml(this._config.orientation)}"
            role="radiogroup"
            aria-label="${escapeHtml(name)}"
            tabindex="${disabled ? -1 : 0}"
            data-index="${currentIndex}"
          >
            <div class="track">
              <div class="thumb" style="--active-color:${escapeHtml(current.color || "var(--primary-color)")}">
                <ha-icon class="thumb-icon" icon="${escapeHtml(current.icon)}"></ha-icon>
              </div>
              ${options.map((option, index) => `
                <button
                  class="zone ${index === currentIndex ? "selected" : ""}"
                  type="button"
                  role="radio"
                  aria-checked="${index === currentIndex}"
                  aria-label="${escapeHtml(option.label)}"
                  data-index="${index}"
                  ${disabled ? "disabled" : ""}
                >
                  <ha-icon icon="${escapeHtml(option.icon)}"></ha-icon>
                </button>
              `).join("")}
            </div>
          </div>

          ${this._config.show_labels ? `
            <div class="labels ${escapeHtml(this._config.orientation)}">
              ${options.map((option, index) => `
                <button
                  type="button"
                  class="label ${index === currentIndex ? "selected" : ""}"
                  data-index="${index}"
                  ${disabled ? "disabled" : ""}
                >
                  ${escapeHtml(option.label)}
                </button>
              `).join("")}
            </div>
          ` : ""}
        </div>

        ${this._config.show_history ? this._renderHistory() : ""}
        ${this._pendingValue ? `<div class="pending" aria-live="polite">Saving...</div>` : ""}
      </ha-card>
    `;

    this._bind(options, disabled);
    if (this._lastRenderedState && this._lastRenderedState !== currentValue) {
      this.shadowRoot.querySelector(".thumb-icon")?.animate(
        [{ transform: "translate(-50%, -50%) scale(.88)", opacity: .72 }, { transform: "translate(-50%, -50%) scale(1)", opacity: 1 }],
        { duration: 160, easing: "ease-out" }
      );
    }
    this._lastRenderedState = currentValue;
  }

  _resolveCurrentIndex(options, currentValue) {
    const currentIndex = findOptionIndex(options, currentValue);
    if (currentIndex >= 0) return currentIndex;

    const lastStableIndex = findOptionIndex(options, this._lastStableValue);
    if (lastStableIndex >= 0) return lastStableIndex;

    return optionIndex(options, currentValue);
  }

  _recordHistory(option) {
    if (!option?.value) return;
    if (this._lastObservedValue === option.value) return;
    this._lastObservedValue = option.value;

    const next = [{
      value: option.value,
      label: option.label,
      icon: option.icon,
      color: option.color,
      at: new Date(),
    }, ...this._history];

    this._history = next.slice(0, this._config?.history_limit ?? DEFAULTS.history_limit);
  }

  _renderHistory() {
    const items = this._history;
    if (!items.length) return "";

    return `
      <div class="history" aria-label="Recent state history">
        ${items.map((entry) => `
          <div class="history-item">
            <ha-icon class="history-icon" icon="${escapeHtml(entry.icon || "mdi:history")}"></ha-icon>
            <span class="history-label">${escapeHtml(entry.label)}</span>
            <span class="history-time">${escapeHtml(formatHistoryTime(entry.at))}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  _bind(options, disabled) {
    if (disabled) return;

    const control = this.shadowRoot.querySelector(".control");
    const interactive = this.shadowRoot.querySelectorAll(".zone, .label");

    interactive.forEach((element) => {
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        this._selectIndex(Number(element.dataset.index), options);
      });
    });

    control?.addEventListener("keydown", (event) => {
      const stateObj = this._hass.states?.[this._config.entity];
      const index = optionIndex(options, this._pendingValue || stateObj?.state);
      let next = index;
      if (["ArrowDown", "ArrowRight"].includes(event.key)) next = Math.min(2, index + 1);
      if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = Math.max(0, index - 1);
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = 2;
      if (next !== index) {
        event.preventDefault();
        this._selectIndex(next, options);
      }
    });

    if (this._config.interaction !== "tap-drag") return;

    control?.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      control.setPointerCapture?.(event.pointerId);
      this._pointer = { id: event.pointerId };
      this._previewPointer(event, control);
    });

    control?.addEventListener("pointermove", (event) => {
      if (this._pointer?.id !== event.pointerId) return;
      this._previewPointer(event, control);
    });

    const finish = (event) => {
      if (this._pointer?.id !== event.pointerId) return;
      const index = this._pointer.index;
      this._pointer = null;
      if (Number.isInteger(index)) this._selectIndex(index, options);
    };
    control?.addEventListener("pointerup", finish);
    control?.addEventListener("pointercancel", () => {
      this._pointer = null;
      this._queueRender();
    });
  }

  _previewPointer(event, control) {
    const rect = control.getBoundingClientRect();
    const ratio = this._config.orientation === "horizontal"
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height;
    const index = Math.max(0, Math.min(2, Math.floor(ratio * 3)));
    this._pointer.index = index;
    control.dataset.index = String(index);
  }

  async _selectIndex(index, options) {
    const option = options[index];
    const stateObj = this._hass.states?.[this._config.entity];
    if (!option || option.value === stateObj?.state || option.value === this._pendingValue) return;

    if (this._config.confirm) {
      const accepted = window.confirm(`Set "${option.label}"?`);
      if (!accepted) return;
    }

    if (this._config.haptic) haptic("selection");
    if (this._config.optimistic) {
      this._pendingValue = option.value;
      this._armPendingTimeout(option.label);
      this._queueRender();
    }

    const domain = domainOf(this._config.entity);
    try {
      await this._hass.callService(domain, "select_option", {
        entity_id: this._config.entity,
        option: option.value,
      });
      fireEvent(this, "three-state-change", {
        entity: this._config.entity,
        option: option.value,
        index,
      });
    } catch (error) {
      this._clearPending();
      this._queueRender();
      fireEvent(this, "hass-notification", {
        message: `Failed to set ${option.label}: ${error?.message ?? error}`,
      });
    }
  }

  _styles() {
    return `
      :host {
        display: block;
        --three-state-track: var(--secondary-background-color, rgba(127,127,127,.25));
        --three-state-thumb: var(--primary-color);
        --three-state-radius: 32px;
        --three-state-duration: 280ms;
        --three-state-card-padding: 20px;
      }
      * { box-sizing: border-box; }
      ha-card {
        position: relative;
        min-height: 100%;
        padding: var(--three-state-card-padding);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 16px;
        touch-action: manipulation;
      }
      .header { text-align: center; min-width: 0; }
      .title {
        color: var(--primary-text-color);
        font-size: 24px;
        line-height: 1.2;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .subtitle {
        color: var(--secondary-text-color);
        font-size: 14px;
        line-height: 1.35;
        font-weight: 500;
        margin-top: 5px;
      }
      .control-wrap {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 14px;
        min-height: 0;
      }
      .control {
        position: relative;
        outline: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .control.vertical { width: 116px; height: 290px; }
      .control.horizontal { width: min(100%, 360px); height: 108px; }
      .track {
        position: absolute;
        inset: 0;
        display: grid;
        overflow: hidden;
        border-radius: var(--three-state-radius);
        background: var(--three-state-track);
        box-shadow: inset 0 0 0 1px rgba(127,127,127,.12);
      }
      .vertical .track { grid-template-rows: repeat(3, 1fr); }
      .horizontal .track { grid-template-columns: repeat(3, 1fr); }
      .thumb {
        --position: 1;
        position: absolute;
        z-index: 2;
        pointer-events: none;
        background: var(--active-color, var(--three-state-thumb));
        border-radius: calc(var(--three-state-radius) - 6px);
        box-shadow: 0 5px 16px rgba(0,0,0,.22);
        transition:
          transform var(--three-state-duration) cubic-bezier(.2,.8,.2,1),
          background var(--three-state-duration) ease;
      }
      .vertical .thumb {
        left: 6px;
        top: 6px;
        width: calc(100% - 12px);
        height: calc((100% - 12px) / 3);
        transform: translateY(calc(var(--position) * 100%));
      }
      .horizontal .thumb {
        left: 6px;
        top: 6px;
        width: calc((100% - 12px) / 3);
        height: calc(100% - 12px);
        transform: translateX(calc(var(--position) * 100%));
      }
      .control[data-index="0"] .thumb { --position: 0; }
      .control[data-index="1"] .thumb { --position: 1; }
      .control[data-index="2"] .thumb { --position: 2; }
      .thumb-icon {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        color: rgba(255,255,255,.98);
        --mdc-icon-size: 24px;
      }
      .zone {
        z-index: 1;
        appearance: none;
        border: 0;
        background: transparent;
        padding: 0;
        color: var(--secondary-text-color);
        cursor: pointer;
        display: grid;
        place-items: center;
        transition: color 180ms ease, opacity 180ms ease, transform 100ms ease;
      }
      .zone.selected { opacity: 0; }
      .zone:not(.selected) { opacity: .9; }
      .zone:active { transform: scale(.92); }
      .zone ha-icon { --mdc-icon-size: 23px; }
      .labels {
        display: flex;
        justify-content: space-around;
        gap: 4px;
      }
      .labels.vertical {
        height: 290px;
        flex-direction: column;
        align-items: flex-start;
      }
      .labels.horizontal {
        width: min(100%, 360px);
        flex-direction: row;
      }
      .label {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        padding: 6px 4px;
        transition: color 180ms ease, font-weight 180ms ease;
      }
      .label.selected {
        color: var(--primary-text-color);
        font-weight: 700;
      }
      .pending {
        position: absolute;
        right: 12px;
        bottom: 8px;
        font-size: 11px;
        color: var(--secondary-text-color);
      }
      .history {
        display: grid;
        gap: 6px;
        padding-top: 4px;
      }
      .history-item {
        display: grid;
        grid-template-columns: 18px 1fr auto;
        gap: 8px;
        align-items: center;
        min-width: 0;
        color: var(--secondary-text-color);
        font-size: 12px;
        line-height: 1.3;
      }
      .history-icon {
        --mdc-icon-size: 16px;
      }
      .history-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .history-time {
        font-variant-numeric: tabular-nums;
      }
      .disabled { opacity: .62; }
      .disabled .zone, .disabled .label { cursor: not-allowed; }

      ha-card.minimal {
        --three-state-track: color-mix(in srgb, var(--secondary-background-color, rgba(127,127,127,.18)) 78%, transparent);
        --three-state-radius: 999px;
        --three-state-card-padding: 16px;
        gap: 12px;
      }
      .minimal .header { text-align: left; }
      .minimal .title {
        font-size: 18px;
        font-weight: 600;
      }
      .minimal .subtitle {
        font-size: 12px;
        margin-top: 3px;
      }
      .minimal .control-wrap {
        justify-content: flex-start;
        gap: 10px;
      }
      .minimal .control.vertical { width: 72px; height: 182px; }
      .minimal .control.horizontal { width: min(100%, 204px); height: 44px; }
      .minimal .track {
        box-shadow: inset 0 0 0 1px rgba(127,127,127,.1);
      }
      .minimal .thumb {
        border-radius: 999px;
        box-shadow: 0 2px 8px rgba(0,0,0,.16);
      }
      .minimal.vertical .thumb,
      .minimal .vertical .thumb {
        left: 4px;
        top: 4px;
        width: calc(100% - 8px);
        height: calc((100% - 8px) / 3);
      }
      .minimal.horizontal .thumb,
      .minimal .horizontal .thumb {
        left: 4px;
        top: 4px;
        width: calc((100% - 8px) / 3);
        height: calc(100% - 8px);
      }
      .minimal .thumb-icon {
        --mdc-icon-size: 20px;
      }
      .minimal .zone ha-icon {
        --mdc-icon-size: 18px;
      }
      .minimal .labels {
        gap: 2px;
      }
      .minimal .labels.vertical {
        height: 182px;
      }
      .minimal .labels.horizontal {
        width: min(100%, 204px);
      }
      .minimal .label {
        font-size: 12px;
        padding: 4px 2px;
      }
      .minimal .history {
        gap: 4px;
        padding-top: 0;
      }
      .minimal .history-item {
        font-size: 11px;
      }

      .compact { --three-state-card-padding: 12px; gap: 8px; }
      .compact .title { font-size: 19px; }
      .compact .control.vertical { width: 88px; height: 220px; }
      .compact .labels.vertical { height: 220px; }
      .compact .control.horizontal { height: 82px; }
      .compact.minimal .control.vertical { width: 64px; height: 160px; }
      .compact.minimal .labels.vertical { height: 160px; }
      .compact.minimal .control.horizontal { width: min(100%, 180px); height: 38px; }
      @media (prefers-reduced-motion: reduce) {
        .thumb, .zone, .label { transition: none !important; }
      }
      @media (max-width: 380px) {
        .control-wrap { gap: 8px; }
        .control.vertical { width: 96px; height: 250px; }
        .labels.vertical { height: 250px; }
        .minimal .control.vertical { width: 68px; height: 170px; }
        .minimal .labels.vertical { height: 170px; }
      }
    `;
  }
}

class ThreeStateSwitchCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
  }

  set hass(value) {
    this._hass = value;
    this._render();
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _render() {
    if (!this.shadowRoot) return;
    const c = this._config ?? {};
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        .form { display:grid; gap:14px; padding:4px 0; }
        label { display:grid; gap:6px; color:var(--primary-text-color); font-size:13px; }
        input, select {
          width:100%; min-height:40px; padding:8px 10px;
          border:1px solid var(--divider-color); border-radius:8px;
          background:var(--card-background-color); color:var(--primary-text-color);
          font:inherit;
        }
        .checks { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .check { display:flex; align-items:center; gap:8px; }
        .check input { width:auto; min-height:auto; }
        details { border-top:1px solid var(--divider-color); padding-top:10px; }
        summary { cursor:pointer; font-weight:600; }
        .hint { color:var(--secondary-text-color); font-size:12px; line-height:1.4; }
      </style>
      <div class="form">
        <label>Entity
          <input data-key="entity" value="${escapeHtml(c.entity ?? "")}" placeholder="input_select.mode">
        </label>
        <label>Name
          <input data-key="name" value="${escapeHtml(c.name ?? "")}" placeholder="Defaults to the entity name">
        </label>
        <label>Subtitle
          <input data-key="subtitle" value="${escapeHtml(c.subtitle ?? "")}" placeholder="Active mode">
        </label>
        <label>Style
          <select data-key="variant">
            <option value="default" ${c.variant !== "minimal" ? "selected" : ""}>Default</option>
            <option value="minimal" ${c.variant === "minimal" ? "selected" : ""}>Minimal</option>
          </select>
        </label>
        <label>Orientation
          <select data-key="orientation">
            <option value="vertical" ${c.orientation !== "horizontal" ? "selected" : ""}>Vertical</option>
            <option value="horizontal" ${c.orientation === "horizontal" ? "selected" : ""}>Horizontal</option>
          </select>
        </label>
        <label>Interaction
          <select data-key="interaction">
            <option value="tap-drag" ${c.interaction !== "tap" ? "selected" : ""}>Tap and drag</option>
            <option value="tap" ${c.interaction === "tap" ? "selected" : ""}>Tap only</option>
          </select>
        </label>
        <div class="checks">
          ${[
            ["show_name", "Show name", c.show_name !== false],
            ["show_subtitle", "Show subtitle", c.show_subtitle !== false],
            ["show_labels", "Show labels", c.show_labels !== false],
            ["show_history", "Show history", Boolean(c.show_history)],
            ["compact", "Compact mode", Boolean(c.compact)],
            ["reverse", "Reverse order", Boolean(c.reverse)],
            ["haptic", "Haptic feedback", c.haptic !== false],
            ["confirm", "Require confirmation", Boolean(c.confirm)],
            ["disabled", "Disable control", Boolean(c.disabled)],
          ].map(([key, text, checked]) => `
            <label class="check">
              <input type="checkbox" data-key="${key}" ${checked ? "checked" : ""}>
              ${text}
            </label>
          `).join("")}
        </div>
        <label>History limit
          <input data-key="history_limit" type="number" min="1" max="20" step="1" value="${escapeHtml(c.history_limit ?? 5)}">
        </label>
        <details>
          <summary>Custom values and labels</summary>
          <p class="hint">Leave these empty to load the first three entity options automatically.</p>
          ${[0,1,2].map((i) => {
            const option = normalizeOption(c.options?.[i] ?? {}, i);
            return `
              <label>Value ${i + 1}
                <input data-option="${i}" data-field="value" value="${escapeHtml(option.value)}">
              </label>
              <label>Label ${i + 1}
                <input data-option="${i}" data-field="label" value="${escapeHtml(option.label)}">
              </label>
              <label>Icon ${i + 1}
                <input data-option="${i}" data-field="icon" value="${escapeHtml(option.icon)}">
              </label>
              <label>Color ${i + 1}
                <input data-option="${i}" data-field="color" value="${escapeHtml(option.color)}" placeholder="var(--primary-color) or #03a9f4">
              </label>
            `;
          }).join("")}
        </details>
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-key]").forEach((el) => {
      el.addEventListener("change", () => this._updateSimple(el));
      if (el.tagName === "INPUT" && el.type !== "checkbox") {
        el.addEventListener("input", () => this._updateSimple(el, true));
      }
    });
    this.shadowRoot.querySelectorAll("[data-option]").forEach((el) => {
      el.addEventListener("change", () => this._updateOption(el));
    });
  }

  _updateSimple(element, debounce = false) {
    const key = element.dataset.key;
    let value = element.type === "checkbox" ? element.checked : element.value;
    if (element.type === "number") {
      value = value === "" ? "" : Number(value);
    }
    const next = { ...this._config };

    if (value === "" && !["entity"].includes(key)) delete next[key];
    else next[key] = value;

    this._config = next;
    clearTimeout(this._timer);
    const emit = () => fireEvent(this, "config-changed", { config: this._config });
    if (debounce) this._timer = setTimeout(emit, 250);
    else emit();
  }

  _updateOption(element) {
    const index = Number(element.dataset.option);
    const field = element.dataset.field;
    const options = [0, 1, 2].map((i) => normalizeOption(this._config.options?.[i] ?? {}, i));
    options[index][field] = element.value;
    const anyValue = options.some((item) => item.value);
    const next = { ...this._config };
    if (anyValue) next.options = options;
    else delete next.options;
    this._config = next;
    fireEvent(this, "config-changed", { config: next });
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, ThreeStateSwitchCard);
if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, ThreeStateSwitchCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Three State Switch Card",
    description: "A polished three-position switch card for input_select and select entities.",
    preview: true,
    documentationURL: "",
    getEntitySuggestion: (hass, entityId) => {
      if (!SUPPORTED_DOMAINS.has(domainOf(entityId))) return null;
      const count = hass?.states?.[entityId]?.attributes?.options?.length;
      if (count !== 3) return null;
      return { config: { type: `custom:${CARD_TAG}`, entity: entityId } };
    },
  });
}

console.info(
  `%c THREE-STATE-SWITCH-CARD %c v${CARD_VERSION} `,
  "color:white;background:#03a9f4;font-weight:700;",
  "color:#03a9f4;background:#fff;font-weight:700;"
);

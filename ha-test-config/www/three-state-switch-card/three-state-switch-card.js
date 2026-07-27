/**
 * Three State Switch Card
 * A dependency-free Home Assistant Lovelace card for input_select/select entities.
 *
 * @license MIT
 */
const CARD_VERSION = "0.1.5";
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
  dialog_orientation: "vertical",
  reverse: false,
  show_name: true,
  show_subtitle: true,
  show_auto_state: true,
  auto_active_color: "#fbc02d",
  show_labels: true,
  compact: false,
  interaction: "tap-drag",
  haptic: true,
  confirm: false,
  disabled: false,
  optimistic: true,
  show_history: false,
  history_hours: 24,
  history_limit: 5,
  state_entity: "",
  auto_entity: "",
  manual_entity: "",
  manual_on_service: "",
  manual_off_service: "",
  actual_state_entity: "",
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

function entityIcon(config, stateObj) {
  return stateObj?.attributes?.icon ?? config.icon ?? "mdi:toggle-switch-variant";
}

function haptic(type = "selection") {
  fireEvent(document.body, "haptic", type);
  try {
    globalThis.navigator?.vibrate?.(type === "success" ? [12, 36, 12] : 12);
  } catch (_) {}
}

function formatHistoryTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHistoryDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(date);
}

function historyPercent(date, start, end) {
  const total = Math.max(1, end.getTime() - start.getTime());
  return Math.max(0, Math.min(100, ((date.getTime() - start.getTime()) / total) * 100));
}

function optionForState(options, state) {
  return options.find((option) => option.value === state);
}

function actualStateOptions(config) {
  return [
    {
      value: "on",
      label: config.actual_state_on_label || "On",
      icon: "mdi:power",
      color: config.actual_state_on_color || "#43a047",
    },
    {
      value: "off",
      label: config.actual_state_off_label || "Off",
      icon: "mdi:power-off",
      color: config.actual_state_off_color || "#757575",
    },
  ];
}

function autoModeOptions(config) {
  return [
    {
      value: "on",
      label: config.auto_on_label || "Auto",
      icon: "mdi:autorenew",
      color: config.auto_on_color || "#03a9f4",
    },
    {
      value: "off",
      label: config.auto_off_label || "Manual",
      icon: "mdi:hand-back-right",
      color: config.auto_off_color || "#ffb300",
    },
  ];
}

function normalizeActualState(value) {
  const state = String(value ?? "").toLowerCase();
  if (["on", "true", "open", "active", "heat", "heating", "1"].includes(state)) return "on";
  if (["off", "false", "closed", "idle", "standby", "0"].includes(state)) return "off";
  return state;
}

function isOnState(value) {
  return normalizeActualState(value) === "on";
}

function isAutoOption(option) {
  const value = String(option?.value ?? "").trim().toLowerCase();
  return ["auto", "automatic", "automat", "automatika"].includes(value);
}

function booleanModel(config) {
  return Boolean(config?.state_entity && config?.auto_entity);
}

function stateEntity(config) {
  return config.state_entity || config.actual_state_entity || "";
}

function manualWriteEntity(config) {
  return config.manual_entity || stateEntity(config);
}

function canWriteBooleanEntity(entityId) {
  return Boolean(entityId) && !["binary_sensor", "sensor"].includes(domainOf(entityId));
}

function booleanModelOptions(config) {
  const defaults = [
    { value: "On", label: "On", icon: "mdi:power", color: "#43a047" },
    { value: "Auto", label: "Auto", icon: "mdi:autorenew", color: "#03a9f4" },
    { value: "Off", label: "Off", icon: "mdi:power-off", color: "#757575" },
  ];
  const custom = Array.isArray(config.options) ? config.options : [];
  return defaults.map((base, index) => normalizeOption({
    value: base.value,
    label: custom[index]?.label ?? custom[index]?.value ?? base.label,
    icon: custom[index]?.icon ?? base.icon,
    color: custom[index]?.color ?? base.color,
  }));
}

function historyRowState(row) {
  return String(row.state ?? row.s ?? "");
}

function historyRowDate(row, fallback) {
  const value = row.last_changed ?? row.last_updated ?? row.lc ?? row.lu;
  if (typeof value === "number") return new Date(value * 1000);
  return new Date(value ?? fallback);
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
    this._historyTimeline = null;
    this._historyFetchKey = "";
    this._historyStateToken = "";
    this._historyFetchAt = 0;
    this._historyRequest = 0;
    this._historyFetchTimer = 0;
    this._actualHistoryTimeline = null;
    this._actualHistoryFetchKey = "";
    this._actualHistoryStateToken = "";
    this._actualHistoryFetchAt = 0;
    this._actualHistoryRequest = 0;
    this._activity = [];
    this._activityFetchKey = "";
    this._activityFetchAt = 0;
    this._activityLoading = false;
    this._activityRequest = 0;
    this._lastRenderedState = "";
    this._renderQueued = false;
    this._dialogOpen = false;
    this._historyDialogOpen = false;
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Card configuration is required.");
    const hasLegacyEntity = Boolean(config.entity);
    const hasBooleanEntities = Boolean(config.state_entity && config.auto_entity);
    if (!hasLegacyEntity && !hasBooleanEntities) {
      throw new Error("Either entity or state_entity with auto_entity is required.");
    }
    if (hasLegacyEntity && !SUPPORTED_DOMAINS.has(domainOf(config.entity))) {
      throw new Error("Only input_select and select entities are supported for entity.");
    }

    const merged = { ...DEFAULTS, ...config };
    if (!["default", "minimal"].includes(merged.variant)) {
      throw new Error("variant must be default or minimal.");
    }
    if (!["vertical", "horizontal"].includes(merged.orientation)) {
      throw new Error("orientation must be vertical or horizontal.");
    }
    if (!["vertical", "horizontal"].includes(merged.dialog_orientation)) {
      throw new Error("dialog_orientation must be vertical or horizontal.");
    }
    if (!["tap", "tap-drag"].includes(merged.interaction)) {
      throw new Error("interaction must be tap or tap-drag.");
    }
    if (!Number.isInteger(merged.history_hours) || merged.history_hours < 1 || merged.history_hours > 168) {
      throw new Error("history_hours must be an integer between 1 and 168.");
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
    const actual = this._currentValue();
    if (this._pendingValue && actual === this._pendingValue) this._clearPending();
    const options = this._options();
    const actualIndex = findOptionIndex(options, actual);
    if (actualIndex >= 0) {
      this._lastStableValue = actual;
      this._recordHistory(options[actualIndex]);
    }
    if (this._config?.variant !== "minimal") this._maybeFetchHistory(options, actual);
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
    if (this._historyFetchTimer) {
      clearTimeout(this._historyFetchTimer);
      this._historyFetchTimer = 0;
    }
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

  _primaryStateObj() {
    if (booleanModel(this._config)) {
      return this._hass?.states?.[stateEntity(this._config)] ||
        this._hass?.states?.[this._config.auto_entity];
    }
    return this._hass?.states?.[this._config.entity];
  }

  _options() {
    if (booleanModel(this._config)) return booleanModelOptions(this._config);
    return deriveOptions(this._config ?? DEFAULTS, this._hass?.states?.[this._config?.entity]);
  }

  _currentValue() {
    if (!booleanModel(this._config)) {
      return String(this._hass?.states?.[this._config?.entity]?.state ?? "");
    }
    const autoState = this._hass?.states?.[this._config.auto_entity]?.state;
    if (isOnState(autoState)) return "Auto";
    const actualState = this._hass?.states?.[stateEntity(this._config)]?.state;
    return isOnState(actualState) ? "On" : "Off";
  }

  _isUnavailable() {
    if (!booleanModel(this._config)) {
      const stateObj = this._hass?.states?.[this._config.entity];
      return !stateObj || ["unavailable", "unknown"].includes(stateObj.state);
    }
    const actual = this._hass?.states?.[stateEntity(this._config)];
    const auto = this._hass?.states?.[this._config.auto_entity];
    return !actual || !auto ||
      ["unavailable", "unknown"].includes(actual.state) ||
      ["unavailable", "unknown"].includes(auto.state);
  }

  _subtitle(current) {
    if (this._config.subtitle) return this._config.subtitle;
    if (!this._config.show_auto_state || !isAutoOption(current)) return current.label;

    const actualEntity = stateEntity(this._config);
    const actualState = this._hass?.states?.[actualEntity]?.state;
    if (!actualEntity || ["unavailable", "unknown"].includes(actualState)) return current.label;

    const actual = optionForState(actualStateOptions(this._config), normalizeActualState(actualState));
    return actual ? `${current.label} \u00b7 ${actual.label}` : current.label;
  }

  _activeColor(current) {
    if (!isAutoOption(current)) return current.color;

    const actualEntity = stateEntity(this._config);
    const actualState = this._hass?.states?.[actualEntity]?.state;
    const autoConfirmed = booleanModel(this._config)
      ? isOnState(this._hass?.states?.[this._config.auto_entity]?.state)
      : this._hass?.states?.[this._config.entity]?.state === current.value;
    return autoConfirmed && isOnState(actualState)
      ? this._config.auto_active_color || current.color
      : current.color;
  }

  _render() {
    if (!this._config || !this._hass) return;

    const stateObj = this._primaryStateObj();
    const unavailable = this._isUnavailable();
    const options = this._options();
    const invalidOptions = options.length !== 3;
    const currentValue = this._pendingValue || this._currentValue();
    const currentIndex = Number.isInteger(this._pointer?.index)
      ? this._pointer.index
      : this._resolveCurrentIndex(options, currentValue);
    const current = options[currentIndex] ?? { value: "", label: "Unknown state", icon: "mdi:help" };
    const displayCurrent = { ...current, color: this._activeColor(current) };
    const disabled = Boolean(this._config.disabled || unavailable || invalidOptions);
    const name = displayName(this._hass, this._config, stateObj);
    const icon = entityIcon(this._config, stateObj);
    const subtitle = unavailable ? "Entity unavailable" :
      invalidOptions ? "Entity must expose exactly three options" :
      this._subtitle(current);
    const isMinimal = this._config.variant === "minimal";

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card
        class="${escapeHtml(this._config.variant)} ${this._config.compact ? "compact" : ""} ${disabled ? "disabled" : ""}"
        aria-disabled="${disabled}"
      >
        ${isMinimal
          ? this._renderMinimal(name, icon, current, displayCurrent, currentIndex, options, disabled)
          : this._renderDefault(name, subtitle, displayCurrent, currentIndex, options, disabled)}

        ${this._config.show_history && !isMinimal ? this._renderHistory(options) : ""}
        ${this._historyDialogOpen ? this._renderHistoryDialog(name, options) : ""}
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

  _renderDefault(name, subtitle, current, currentIndex, options, disabled) {
    return `
      <div class="header">
        <button
          class="history-action"
          type="button"
          aria-label="Show entity history"
          title="Show history"
        >
          <ha-icon icon="mdi:chart-line"></ha-icon>
        </button>
        ${this._config.show_name ? `<div class="title">${escapeHtml(name)}</div>` : ""}
        ${this._config.show_subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      ${this._renderControlLayout(name, current, currentIndex, options, disabled, this._config.orientation)}
    `;
  }

  _renderMinimal(name, icon, accentCurrent, controlCurrent, currentIndex, options, disabled) {
    const accent = escapeHtml(accentCurrent.color || "var(--primary-color)");
    const dialogOrientation = this._config.dialog_orientation || DEFAULTS.dialog_orientation;
    return `
      <div class="minimal-row" style="--state-accent:${accent}">
        <button
          class="minimal-summary"
          type="button"
          aria-haspopup="dialog"
          aria-label="${escapeHtml(name)}"
        >
          <ha-icon class="minimal-state-icon" icon="${escapeHtml(icon)}"></ha-icon>
          <span class="minimal-title">${escapeHtml(name)}</span>
        </button>
        <div class="minimal-inline-control">
          ${this._renderControlLayout(name, controlCurrent, currentIndex, options, disabled, "horizontal", "inline-layout", "inline", false)}
        </div>
      </div>
      ${this._dialogOpen ? `
        <div class="dialog-backdrop" role="presentation">
          <div class="switch-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(name)}" style="--state-accent:${accent}">
            <div class="dialog-header">
              <ha-icon class="dialog-entity-icon" icon="${escapeHtml(icon)}"></ha-icon>
              <div class="dialog-title">${escapeHtml(name)}</div>
              <button class="dialog-history-action" type="button" aria-label="Show entity history" title="Show history">
                <ha-icon icon="mdi:chart-line"></ha-icon>
              </button>
              <button class="dialog-close" type="button" aria-label="Close">
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
            ${this._renderControlLayout(name, controlCurrent, currentIndex, options, disabled, dialogOrientation, "dialog-control", "dialog")}
          </div>
        </div>
      ` : ""}
    `;
  }

  _renderControlLayout(name, current, currentIndex, options, disabled, orientation, layoutClass = "", mode = "", showLabels = true) {
    return `
      <div class="control-wrap ${escapeHtml(orientation)} ${escapeHtml(layoutClass)}">
        ${this._renderControl(name, current, currentIndex, options, disabled, orientation, mode)}
        ${showLabels ? this._renderLabels(options, currentIndex, disabled, orientation) : ""}
      </div>
    `;
  }

  _renderControl(name, current, currentIndex, options, disabled, orientation, mode = "") {
    return `
      <div
        class="control ${escapeHtml(orientation)} ${escapeHtml(mode)}"
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
    `;
  }

  _renderLabels(options, currentIndex, disabled, orientation) {
    if (!this._config.show_labels) return "";
    return `
      <div class="labels ${escapeHtml(orientation)}">
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
    `;
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

  _maybeFetchHistory(options, actual) {
    if (!this._config?.show_history || !this._hass?.callApi || options.length !== 3) return;
    if (booleanModel(this._config)) return;

    const now = Date.now();
    const key = `${this._config.entity}|${this._config.history_hours}`;
    const stateToken = String(actual ?? "");
    const isFresh = this._historyFetchKey === key &&
      this._historyStateToken === stateToken &&
      now - this._historyFetchAt < 60000;
    if (isFresh) return;
    if (this._historyFetchTimer) clearTimeout(this._historyFetchTimer);

    this._historyFetchTimer = setTimeout(() => {
      this._historyFetchTimer = 0;
      this._fetchHistory(options, stateToken, key);
    }, 250);
  }

  async _fetchHistory(options, stateToken, key) {
    const request = ++this._historyRequest;
    const timeline = await this._fetchEntityTimeline(this._config.entity, options, stateToken, request, () => this._historyRequest);
    if (!timeline) {
      if (request === this._historyRequest) {
        this._historyTimeline = null;
        this._historyFetchKey = key;
        this._historyStateToken = stateToken;
        this._historyFetchAt = Date.now();
      }
      return;
    }

    if (request !== this._historyRequest) return;
    this._historyTimeline = timeline;
    this._historyFetchKey = key;
    this._historyStateToken = stateToken;
    this._historyFetchAt = Date.now();
    this._queueRender();
  }

  async _fetchActualHistory(stateToken, key) {
    if (!this._config.actual_state_entity) return;

    const request = ++this._actualHistoryRequest;
    const timeline = await this._fetchEntityTimeline(
      this._config.actual_state_entity,
      actualStateOptions(this._config),
      normalizeActualState(stateToken),
      request,
      () => this._actualHistoryRequest,
      normalizeActualState
    );

    if (!timeline) {
      if (request === this._actualHistoryRequest) {
        this._actualHistoryTimeline = null;
        this._actualHistoryFetchKey = key;
        this._actualHistoryStateToken = String(stateToken ?? "");
        this._actualHistoryFetchAt = Date.now();
      }
      return;
    }

    if (request !== this._actualHistoryRequest) return;
    this._actualHistoryTimeline = timeline;
    this._actualHistoryFetchKey = key;
    this._actualHistoryStateToken = String(stateToken ?? "");
    this._actualHistoryFetchAt = Date.now();
    this._queueRender();
  }

  async _fetchEntityTimeline(entityId, options, stateToken, request, currentRequest, normalize = (value) => String(value ?? "")) {
    if (!this._hass?.callApi || !entityId) return null;

    const end = new Date();
    const start = new Date(end.getTime() - this._config.history_hours * 60 * 60 * 1000);
    const path = `history/period/${encodeURIComponent(start.toISOString())}?` + [
      `filter_entity_id=${encodeURIComponent(entityId)}`,
      `end_time=${encodeURIComponent(end.toISOString())}`,
      "minimal_response",
      "no_attributes",
    ].join("&");

    try {
      const response = await this._hass.callApi("GET", path);
      if (request !== currentRequest()) return null;

      const rows = Array.isArray(response?.[0]) ? response[0] : [];
      const states = rows
        .map((row) => ({
          value: normalize(historyRowState(row)),
          at: historyRowDate(row, end),
        }))
        .filter((row) => optionForState(options, row.value) && !Number.isNaN(row.at.getTime()))
        .sort((a, b) => a.at.getTime() - b.at.getTime());

      const current = optionForState(options, normalize(stateToken));
      if (current && states.at(-1)?.value !== current.value) {
        states.push({ value: current.value, at: end });
      }

      const segments = states.map((state, index) => {
        const option = optionForState(options, state.value);
        const from = state.at < start ? start : state.at;
        const next = states[index + 1]?.at ?? end;
        const to = next > end ? end : next;
        return { option, from, to };
      }).filter((segment) => segment.option && segment.to > segment.from);

      return { start, end, states, segments };
    } catch (_) {
      return null;
    }
  }

  async _fetchActivity(key) {
    if (!this._hass?.callApi || !this._config?.entity) return;

    const now = Date.now();
    const isFresh = this._activityFetchKey === key && now - this._activityFetchAt < 60000;
    if (isFresh) return;

    const request = ++this._activityRequest;
    const end = new Date();
    const start = new Date(end.getTime() - this._config.history_hours * 60 * 60 * 1000);
    const activityEntities = [
      this._config.entity || this._config.auto_entity,
      stateEntity(this._config),
      this._config.manual_entity,
    ]
      .filter(Boolean)
      .join(",");
    const path = `logbook/${encodeURIComponent(start.toISOString())}?` + [
      `end_time=${encodeURIComponent(end.toISOString())}`,
      `entity=${encodeURIComponent(activityEntities)}`,
    ].join("&");

    this._activityLoading = true;
    this._queueRender();

    try {
      const response = await this._hass.callApi("GET", path);
      if (request !== this._activityRequest) return;

      this._activity = Array.isArray(response)
        ? response.slice(0, this._config.history_limit).map((row) => ({
          name: String(row.name ?? row.entity_id ?? this._config.entity),
          message: String(row.message ?? row.state ?? row.event_type ?? ""),
          when: new Date(row.when ?? row.time_fired ?? row.context_event_time ?? Date.now()),
        })).filter((row) => !Number.isNaN(row.when.getTime()))
        : [];
      this._activityFetchKey = key;
      this._activityFetchAt = Date.now();
    } catch (_) {
      if (request === this._activityRequest) {
        this._activity = [];
        this._activityFetchKey = key;
        this._activityFetchAt = Date.now();
      }
    } finally {
      if (request === this._activityRequest) {
        this._activityLoading = false;
        this._queueRender();
      }
    }
  }

  _openHistoryDialog(options) {
    const controlEntity = this._config.entity || this._config.auto_entity;
    const stateObj = controlEntity ? this._hass?.states?.[controlEntity] : undefined;
    const stateToken = String(this._pendingValue || stateObj?.state || "");
    const actualEntity = stateEntity(this._config);
    const actualStateObj = actualEntity ? this._hass?.states?.[actualEntity] : undefined;
    const actualStateToken = String(actualStateObj?.state || "");
    const key = `${controlEntity}|${this._config.history_hours}|dialog`;
    const actualKey = `${actualEntity}|${this._config.history_hours}|dialog`;

    this._historyDialogOpen = true;
    this._queueRender();
    if (booleanModel(this._config)) {
      this._fetchEntityTimeline(
        this._config.auto_entity,
        autoModeOptions(this._config),
        this._hass?.states?.[this._config.auto_entity]?.state,
        ++this._historyRequest,
        () => this._historyRequest,
        normalizeActualState
      ).then((timeline) => {
        if (timeline) {
          this._historyTimeline = timeline;
          this._queueRender();
        }
      });
      this._fetchActualHistory(actualStateToken, actualKey);
    } else {
      this._fetchHistory(options, stateToken, key);
      if (actualEntity) this._fetchActualHistory(actualStateToken, actualKey);
    }
    this._fetchActivity(key);
  }

  _renderHistory(options) {
    const timeline = this._renderTimeline(this._historyTimeline, options);
    if (timeline) return timeline;

    const fallback = this._renderHistoryList(this._history);
    return fallback ? `<div class="history" aria-label="Recent state history">${fallback}</div>` : "";
  }

  _renderTimeline(timeline, options) {
    if (timeline?.segments?.length) {
      const { start, end, states, segments } = timeline;
      const recent = states
        .slice()
        .reverse()
        .slice(0, this._config.history_limit)
        .map((entry) => ({ ...optionForState(options, entry.value), at: entry.at }))
        .filter((entry) => entry.value);

      return `
        <div class="history" aria-label="Recent state history">
          <div class="history-chart" title="Last ${escapeHtml(this._config.history_hours)} hours">
            ${segments.map((segment) => {
              const left = historyPercent(segment.from, start, end);
              const right = historyPercent(segment.to, start, end);
              const width = Math.max(.8, right - left);
              return `
                <div
                  class="history-segment"
                  style="left:${left}%;width:${width}%;--segment-color:${escapeHtml(segment.option.color || "var(--primary-color)")}"
                  title="${escapeHtml(segment.option.label)} ${escapeHtml(formatHistoryTime(segment.from))} - ${escapeHtml(formatHistoryTime(segment.to))}"
                ></div>
              `;
            }).join("")}
          </div>
          <div class="history-axis">
            <span>${escapeHtml(formatHistoryTime(start))}</span>
            <span>${escapeHtml(formatHistoryTime(end))}</span>
          </div>
          <div class="history-legend">
            ${options.map((option) => `
              <span class="history-legend-item">
                <span class="history-dot" style="--segment-color:${escapeHtml(option.color || "var(--primary-color)")}"></span>
                ${escapeHtml(option.label)}
              </span>
            `).join("")}
          </div>
          ${this._renderHistoryList(recent)}
        </div>
      `;
    }

    return "";
  }

  _renderHistoryDialog(name, options) {
    const hasActual = Boolean(stateEntity(this._config));
    const actual = hasActual
      ? this._renderTimeline(this._actualHistoryTimeline, actualStateOptions(this._config)) ||
        `<div class="history-empty">No on/off history is available yet.</div>`
      : "";
    const modeOptions = booleanModel(this._config) ? autoModeOptions(this._config) : options;
    const mode = this._renderTimeline(this._historyTimeline, modeOptions) ||
      `<div class="history-empty">No mode history is available yet.</div>`;
    const activity = this._renderActivity();

    return `
      <div class="history-dialog-backdrop" role="presentation">
        <div class="history-dialog" role="dialog" aria-modal="true" aria-label="History">
          <div class="history-dialog-header">
            <ha-icon class="history-dialog-icon" icon="mdi:chart-line"></ha-icon>
            <div class="history-dialog-title">${escapeHtml(name)}</div>
            <button class="history-dialog-close" type="button" aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          ${hasActual ? `
            <section class="history-dialog-section">
              <div class="history-dialog-section-title">Skutečný stav</div>
              ${actual}
            </section>
            <section class="history-dialog-section">
              <div class="history-dialog-section-title">Režim řízení</div>
              ${mode}
            </section>
          ` : `
          <section class="history-dialog-section">
            <div class="history-dialog-section-title">Historie</div>
            ${mode}
          </section>
          `}
          <section class="history-dialog-section">
            <div class="history-dialog-section-title">Aktivita</div>
            ${activity}
          </section>
        </div>
      </div>
    `;
  }

  _renderActivity() {
    if (this._activityLoading && !this._activity.length) {
      return `<div class="history-empty">Loading activity...</div>`;
    }
    if (!this._activity.length) {
      return `<div class="history-empty">No activity is available yet.</div>`;
    }

    return `
      <div class="activity-list">
        ${this._activity.map((entry) => `
          <div class="activity-date">${escapeHtml(formatHistoryDate(entry.when))}</div>
          <div class="activity-item">
            <span class="activity-dot"></span>
            <span class="activity-message">${escapeHtml(entry.message || entry.name)}</span>
            <span class="activity-time">${escapeHtml(formatHistoryTime(entry.when))}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  _renderHistoryList(items) {
    if (!items.length) return "";

    return `
      <div class="history-list">
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
    const controls = this.shadowRoot.querySelectorAll(".control");
    const interactive = this.shadowRoot.querySelectorAll(".zone, .label");
    const minimalSummary = this.shadowRoot.querySelector(".minimal-summary");
    const dialogBackdrop = this.shadowRoot.querySelector(".dialog-backdrop");
    const dialogClose = this.shadowRoot.querySelector(".dialog-close");
    const historyAction = this.shadowRoot.querySelector(".history-action");
    const dialogHistoryAction = this.shadowRoot.querySelector(".dialog-history-action");
    const historyDialogBackdrop = this.shadowRoot.querySelector(".history-dialog-backdrop");
    const historyDialogClose = this.shadowRoot.querySelector(".history-dialog-close");

    historyAction?.addEventListener("click", (event) => {
      event.stopPropagation();
      this._openHistoryDialog(options);
    });

    dialogHistoryAction?.addEventListener("click", (event) => {
      event.stopPropagation();
      this._dialogOpen = false;
      this._openHistoryDialog(options);
    });

    minimalSummary?.addEventListener("click", (event) => {
      event.stopPropagation();
      this._dialogOpen = true;
      this._queueRender();
    });

    dialogClose?.addEventListener("click", (event) => {
      event.stopPropagation();
      this._dialogOpen = false;
      this._queueRender();
    });

    dialogBackdrop?.addEventListener("click", (event) => {
      if (event.target !== dialogBackdrop) return;
      this._dialogOpen = false;
      this._queueRender();
    });

    const preventBackdropScroll = (event) => {
      if (event.target !== dialogBackdrop || !event.cancelable) return;
      event.preventDefault();
    };
    dialogBackdrop?.addEventListener("touchmove", preventBackdropScroll, { passive: false });

    historyDialogClose?.addEventListener("click", (event) => {
      event.stopPropagation();
      this._historyDialogOpen = false;
      this._queueRender();
    });

    historyDialogBackdrop?.addEventListener("click", (event) => {
      if (event.target !== historyDialogBackdrop) return;
      this._historyDialogOpen = false;
      this._queueRender();
    });

    if (disabled) return;

    interactive.forEach((element) => {
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        this._selectIndex(Number(element.dataset.index), options);
      });
    });

    controls.forEach((control) => {
      control.addEventListener("keydown", (event) => {
        const index = optionIndex(options, this._pendingValue || this._currentValue());
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
    });

    if (this._config.interaction !== "tap-drag") return;

    controls.forEach((control) => {
      control.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        control.setPointerCapture?.(event.pointerId);
        this._pointer = { id: event.pointerId };
        this._previewPointer(event, control);
      }, { passive: false });

      control.addEventListener("pointermove", (event) => {
        if (this._pointer?.id !== event.pointerId) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        this._previewPointer(event, control);
      }, { passive: false });

      const finish = (event) => {
        if (this._pointer?.id !== event.pointerId) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        const index = this._pointer.index;
        this._pointer = null;
        if (Number.isInteger(index)) this._selectIndex(index, options);
      };
      control.addEventListener("pointerup", finish, { passive: false });
      control.addEventListener("pointercancel", () => {
        this._pointer = null;
        this._queueRender();
      });
    });
  }

  _previewPointer(event, control) {
    const rect = control.getBoundingClientRect();
    const ratio = control.classList.contains("horizontal")
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height;
    const index = Math.max(0, Math.min(2, Math.floor(ratio * 3)));
    const changed = this._pointer.index !== index;
    this._pointer.index = index;
    this.shadowRoot.querySelectorAll(".control").forEach((activeControl) => {
      activeControl.dataset.index = String(index);
    });
    control.dataset.index = String(index);
    if (changed) this._queueRender();
  }

  async _selectIndex(index, options) {
    const option = options[index];
    const currentValue = this._currentValue();
    if (!option || option.value === currentValue || option.value === this._pendingValue) return;

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

    try {
      if (booleanModel(this._config)) {
        await this._selectBooleanOption(option);
      } else {
        const domain = domainOf(this._config.entity);
        await this._hass.callService(domain, "select_option", {
          entity_id: this._config.entity,
          option: option.value,
        });
      }
      fireEvent(this, "three-state-change", {
        entity: this._config.entity || stateEntity(this._config),
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

  async _selectBooleanOption(option) {
    const value = String(option.value).toLowerCase();
    const writeEntity = manualWriteEntity(this._config);
    const canStartManual = canWriteBooleanEntity(writeEntity) || Boolean(this._config.manual_on_service);
    const canStopManual = canWriteBooleanEntity(writeEntity) || Boolean(this._config.manual_off_service);

    if (value === "auto") {
      if (canStopManual) {
        await this._setManualControl(false);
      }
      await this._setBooleanEntity(this._config.auto_entity, true);
      return;
    }

    if ((value === "on" && !canStartManual) || (value === "off" && !canStopManual)) {
      throw new Error("A writable manual_entity or matching manual service is required.");
    }

    await this._setBooleanEntity(this._config.auto_entity, false);
    await this._setManualControl(value === "on");
  }

  async _setManualControl(enabled) {
    const service = String(enabled
      ? this._config.manual_on_service
      : this._config.manual_off_service
      || "").trim();
    if (service) {
      const [domain, action, ...rest] = service.split(".");
      if (!domain || !action || rest.length) {
        throw new Error("Manual service must use domain.service format.");
      }
      await this._hass.callService(domain, action, {});
      return;
    }

    const entityId = manualWriteEntity(this._config);
    if (!canWriteBooleanEntity(entityId)) {
      throw new Error("manual_entity must be set to a writable boolean entity.");
    }
    await this._setBooleanEntity(entityId, enabled);
  }

  async _setBooleanEntity(entityId, enabled) {
    await this._hass.callService("homeassistant", enabled ? "turn_on" : "turn_off", {
      entity_id: entityId,
    });
  }

  _styles() {
    return `
      :host {
        display: block;
        --three-state-track: color-mix(in srgb, var(--secondary-background-color, rgba(127,127,127,.18)) 78%, transparent);
        --three-state-thumb: var(--primary-color);
        --three-state-radius: 999px;
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
      .header {
        position: relative;
        text-align: center;
        min-width: 0;
        padding-inline: 42px;
      }
      .history-action {
        position: absolute;
        top: -4px;
        right: 0;
        width: 36px;
        height: 36px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        appearance: none;
        display: grid;
        place-items: center;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        transition: background 160ms ease, color 160ms ease, transform 100ms ease;
      }
      .history-action:hover,
      .history-action:focus-visible {
        background: var(--secondary-background-color, rgba(127,127,127,.16));
        color: var(--primary-text-color);
        outline: none;
      }
      .history-action:active {
        transform: scale(.94);
      }
      .history-action ha-icon {
        --mdc-icon-size: 22px;
      }
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
      .control-wrap.horizontal {
        flex-direction: column;
        align-items: center;
      }
      .control {
        position: relative;
        outline: none;
        user-select: none;
        touch-action: none;
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
        box-shadow: inset 0 0 0 1px rgba(127,127,127,.1);
      }
      .vertical .track { grid-template-rows: repeat(3, 1fr); }
      .horizontal .track { grid-template-columns: repeat(3, 1fr); }
      .thumb {
        --position: 1;
        position: absolute;
        z-index: 2;
        pointer-events: none;
        background: var(--active-color, var(--three-state-thumb));
        border-radius: 999px;
        box-shadow: 0 2px 8px rgba(0,0,0,.16);
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
      .zone.selected { opacity: .9; }
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
        gap: 8px;
        padding-top: 4px;
      }
      .history-chart {
        position: relative;
        height: 34px;
        border-radius: 8px;
        overflow: hidden;
        background: var(--secondary-background-color, rgba(127,127,127,.18));
        box-shadow: inset 0 0 0 1px rgba(127,127,127,.12);
      }
      .history-segment {
        position: absolute;
        top: 0;
        bottom: 0;
        min-width: 2px;
        background: var(--segment-color, var(--primary-color));
      }
      .history-axis {
        display: flex;
        justify-content: space-between;
        color: var(--secondary-text-color);
        font-size: 11px;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .history-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
        min-width: 0;
      }
      .history-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--secondary-text-color);
        font-size: 11px;
        line-height: 1.2;
      }
      .history-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--segment-color, var(--primary-color));
      }
      .history-list {
        display: grid;
        gap: 6px;
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
      .history-empty {
        color: var(--secondary-text-color);
        font-size: 13px;
        line-height: 1.4;
      }
      .history-dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(0,0,0,.45);
      }
      .history-dialog {
        width: min(640px, 100%);
        max-height: calc(100vh - 48px);
        overflow: auto;
        display: grid;
        gap: 24px;
        padding: 24px;
        border-radius: 12px;
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color);
        box-shadow: 0 16px 42px rgba(0,0,0,.34);
      }
      .history-dialog-header {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) 36px;
        align-items: center;
        gap: 10px;
      }
      .history-dialog-icon {
        color: var(--primary-color);
        --mdc-icon-size: 24px;
      }
      .history-dialog-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 20px;
        font-weight: 700;
      }
      .history-dialog-close {
        appearance: none;
        border: 0;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        padding: 0;
        display: grid;
        place-items: center;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
      }
      .history-dialog-close:active {
        background: var(--secondary-background-color, rgba(127,127,127,.16));
      }
      .history-dialog-section {
        display: grid;
        gap: 12px;
        min-width: 0;
      }
      .history-dialog-section-title {
        font-size: 24px;
        font-weight: 700;
        line-height: 1.2;
      }
      .history-dialog .history {
        padding-top: 0;
      }
      .history-dialog .history-chart {
        height: 26px;
      }
      .activity-list {
        display: grid;
        gap: 10px;
      }
      .activity-date {
        margin-top: 4px;
        color: var(--primary-text-color);
        font-size: 13px;
        font-weight: 700;
      }
      .activity-item {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        color: var(--secondary-text-color);
        font-size: 13px;
      }
      .activity-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--primary-color);
        justify-self: center;
      }
      .activity-message {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .activity-time {
        font-variant-numeric: tabular-nums;
      }
      .disabled { opacity: .62; }
      .disabled .zone, .disabled .label { cursor: not-allowed; }

      ha-card.minimal {
        --three-state-radius: 999px;
        --three-state-card-padding: 12px;
        gap: 10px;
      }
      .minimal-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .minimal-summary {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--primary-text-color);
        font: inherit;
        min-width: 0;
        padding: 0;
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        text-align: left;
        cursor: pointer;
      }
      .minimal-state-icon {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        color: rgba(255,255,255,.98);
        background: var(--state-accent, var(--primary-color));
        box-shadow: 0 2px 8px rgba(0,0,0,.16);
        --mdc-icon-size: 21px;
      }
      .minimal-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.25;
      }
      .minimal .control-wrap {
        justify-content: center;
        gap: 10px;
      }
      .minimal .control-wrap.inline-layout.horizontal {
        flex-direction: row;
        align-items: center;
      }
      .minimal .control-wrap.dialog-control.horizontal {
        flex-direction: column;
        align-items: center;
      }
      .minimal .control-wrap.dialog-control.vertical {
        flex-direction: row;
        align-items: center;
      }
      .minimal .control.inline.horizontal .track {
        background: color-mix(in srgb, var(--state-accent, var(--three-state-track)) 14%, var(--three-state-track));
      }
      .minimal .control.inline.horizontal .zone ha-icon,
      .minimal .control.dialog.vertical .zone ha-icon {
        color: color-mix(in srgb, var(--state-accent, var(--primary-color)) 62%, var(--secondary-text-color));
      }
      .minimal .label.selected {
        color: var(--state-accent, var(--primary-text-color));
      }
      .minimal .control.inline.horizontal { width: 132px; height: 38px; }
      .minimal .control.dialog.vertical { width: 116px; height: 290px; }
      .minimal .control.inline.horizontal .thumb {
        left: 4px;
        top: 4px;
        width: calc((100% - 8px) / 3);
        height: calc(100% - 8px);
      }
      .minimal .control.dialog.vertical .thumb {
        left: 6px;
        top: 6px;
        width: calc(100% - 12px);
        height: calc((100% - 12px) / 3);
      }
      .minimal .control.inline.horizontal .thumb-icon {
        --mdc-icon-size: 17px;
      }
      .minimal .control.inline.horizontal .zone ha-icon {
        --mdc-icon-size: 16px;
      }
      .minimal .control.dialog.vertical .thumb-icon {
        --mdc-icon-size: 24px;
      }
      .minimal .control.dialog.vertical .zone ha-icon {
        --mdc-icon-size: 23px;
      }
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(0,0,0,.45);
        touch-action: none;
        overscroll-behavior: contain;
      }
      .switch-dialog {
        width: min(320px, 100%);
        max-height: calc(100vh - 48px);
        overflow: auto;
        display: grid;
        gap: 18px;
        padding: 18px;
        border-radius: 12px;
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color);
        box-shadow: 0 16px 42px rgba(0,0,0,.34);
        overscroll-behavior: contain;
      }
      .dialog-header {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) 36px 36px;
        align-items: center;
        gap: 10px;
      }
      .dialog-entity-icon {
        color: var(--state-accent, var(--primary-color));
        --mdc-icon-size: 24px;
      }
      .dialog-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 18px;
        font-weight: 600;
      }
      .dialog-history-action,
      .dialog-close {
        appearance: none;
        border: 0;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        padding: 0;
        display: grid;
        place-items: center;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
      }
      .dialog-history-action:active,
      .dialog-close:active {
        background: var(--secondary-background-color, rgba(127,127,127,.16));
      }
      .dialog-history-action ha-icon,
      .dialog-close ha-icon {
        --mdc-icon-size: 22px;
      }
      .dialog-control {
        justify-content: center;
        gap: 12px;
      }
      .minimal .labels {
        gap: 2px;
      }
      .minimal .labels.vertical {
        height: 290px;
      }
      .minimal .labels.horizontal {
        width: min(100%, 360px);
      }
      .minimal .label {
        font-size: 12px;
        padding: 4px 2px;
      }
      .minimal .history {
        gap: 4px;
        padding-top: 0;
      }
      .minimal .history-chart {
        height: 24px;
        border-radius: 6px;
      }
      .minimal .history-item {
        font-size: 11px;
      }

      .compact { --three-state-card-padding: 12px; gap: 8px; }
      .compact .title { font-size: 19px; }
      .compact .control.vertical { width: 88px; height: 220px; }
      .compact .labels.vertical { height: 220px; }
      .compact .control.horizontal { height: 82px; }
      .compact.minimal .control.inline.horizontal { width: 116px; height: 34px; }
      .compact.minimal .control.dialog.vertical { width: 88px; height: 220px; }
      .compact.minimal .labels.vertical { height: 220px; }
      @media (prefers-reduced-motion: reduce) {
        .thumb, .zone, .label { transition: none !important; }
      }
      @media (max-width: 380px) {
        .control-wrap { gap: 8px; }
        .control.vertical { width: 96px; height: 250px; }
        .labels.vertical { height: 250px; }
        .minimal-row { gap: 8px; }
        .minimal-summary { grid-template-columns: 30px minmax(0, 1fr); gap: 8px; }
        .minimal-state-icon { width: 30px; height: 30px; --mdc-icon-size: 19px; }
        .minimal .control.inline.horizontal { width: 108px; height: 34px; }
        .minimal .control.dialog.vertical { width: 96px; height: 250px; }
        .minimal .labels.vertical { height: 250px; }
        .dialog-backdrop { padding: 16px; }
        .history-dialog-backdrop { padding: 16px; }
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
    const isBooleanConfig = Boolean(c.state_entity && c.auto_entity);
    const editorOptions = isBooleanConfig
      ? booleanModelOptions(c)
      : [0, 1, 2].map((i) => normalizeOption(c.options?.[i] ?? {}, i));
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        .form { display:grid; gap:14px; padding:4px 0; }
        label { display:grid; gap:6px; color:var(--primary-text-color); font-size:13px; }
        input, select, ha-entity-picker {
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
          <ha-entity-picker data-key="entity" value="${escapeHtml(c.entity ?? "")}" include-domains="input_select,select"></ha-entity-picker>
        </label>
        <label>Actual on/off state entity
          <ha-entity-picker data-key="state_entity" value="${escapeHtml(c.state_entity ?? c.actual_state_entity ?? "")}"></ha-entity-picker>
        </label>
        <label>Auto mode entity
          <ha-entity-picker data-key="auto_entity" value="${escapeHtml(c.auto_entity ?? "")}" include-domains="input_boolean,switch,binary_sensor"></ha-entity-picker>
        </label>
        <label>Manual on/off write entity
          <ha-entity-picker data-key="manual_entity" value="${escapeHtml(c.manual_entity ?? "")}" include-domains="input_boolean,switch"></ha-entity-picker>
        </label>
        <label>Name
          <input data-key="name" value="${escapeHtml(c.name ?? "")}" placeholder="Defaults to the entity name">
        </label>
        <label>Subtitle
          <input data-key="subtitle" value="${escapeHtml(c.subtitle ?? "")}" placeholder="Active mode">
        </label>
        <label>Auto active color
          <input data-key="auto_active_color" value="${escapeHtml(c.auto_active_color ?? "#fbc02d")}" placeholder="#fbc02d or var(--warning-color)">
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
        <label>Expanded minimal dialog orientation
          <select data-key="dialog_orientation">
            <option value="vertical" ${c.dialog_orientation !== "horizontal" ? "selected" : ""}>Vertical</option>
            <option value="horizontal" ${c.dialog_orientation === "horizontal" ? "selected" : ""}>Horizontal</option>
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
            ["show_auto_state", "Show actual state in Auto", c.show_auto_state !== false],
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
        <label>History hours
          <input data-key="history_hours" type="number" min="1" max="168" step="1" value="${escapeHtml(c.history_hours ?? 24)}">
        </label>
        <label>History limit
          <input data-key="history_limit" type="number" min="1" max="20" step="1" value="${escapeHtml(c.history_limit ?? 5)}">
        </label>
        <details>
          <summary>State labels, icons, and colors</summary>
          <p class="hint">${
            isBooleanConfig
              ? "Boolean mode uses fixed internal values On, Auto, and Off. Edit labels, icons, and colors only."
              : "Leave these empty to load the first three entity options automatically."
          }</p>
          ${[0,1,2].map((i) => {
            const option = editorOptions[i];
            return `
              <label>Value ${i + 1}
                <input
                  ${isBooleanConfig ? "" : `data-option="${i}" data-field="value"`}
                  value="${escapeHtml(option.value)}"
                  ${isBooleanConfig ? "disabled" : ""}
                >
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

    this.shadowRoot.querySelectorAll("ha-entity-picker[data-key]").forEach((el) => {
      const includeDomains = {
        entity: ["input_select", "select"],
        auto_entity: ["input_boolean", "switch", "binary_sensor"],
        manual_entity: ["input_boolean", "switch"],
      }[el.dataset.key];
      el.hass = this._hass;
      el.value = this._config?.[el.dataset.key] ?? "";
      if (includeDomains) el.includeDomains = includeDomains;
      el.addEventListener("value-changed", (event) => {
        this._updateConfigValue(el.dataset.key, event.detail?.value ?? "");
      });
    });
    this.shadowRoot.querySelectorAll("[data-key]").forEach((el) => {
      if (el.tagName === "HA-ENTITY-PICKER") return;
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
    this._updateConfigValue(key, value, debounce);
  }

  _updateConfigValue(key, value, debounce = false) {
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
    if (!Number.isInteger(index) || !field) return;
    const isBooleanConfig = booleanModel(this._config);
    if (isBooleanConfig && field === "value") return;
    const options = isBooleanConfig
      ? booleanModelOptions(this._config)
      : [0, 1, 2].map((i) => normalizeOption(this._config.options?.[i] ?? {}, i));
    options[index][field] = element.value;
    const anyValue = isBooleanConfig || options.some((item) => item.value);
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
    documentationURL: "https://github.com/moukas/three-state-switch-card",
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

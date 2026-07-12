# Installation

## HACS Custom Repository

1. Publish the project to a public GitHub repository named `three-state-switch-card`.
2. In HACS, open the three-dot menu and select **Custom repositories**.
3. Paste the repository URL.
4. Set the repository type to **Dashboard**.
5. Add the repository and install the card.
6. Reload the Home Assistant frontend. If the old version remains cached, hard refresh the browser.

HACS loads `dist/three-state-switch-card.js`. The filename matches the repository name,
which matters for HACS validation and release packaging. GitHub releases should publish
the built `three-state-switch-card.js` bundle directly.

## Manual Installation

1. Copy `dist/three-state-switch-card.js` to:
   `/config/www/three-state-switch-card/three-state-switch-card.js`
2. In Home Assistant, open:
   **Settings -> Dashboards -> Resources**
3. Add this JavaScript module:

```text
/local/three-state-switch-card/three-state-switch-card.js
```

4. Add the card to a dashboard:

```yaml
type: custom:three-state-switch-card
entity: input_select.heating_mode
```

## Updating

For HACS installs, install the new version and reload the frontend.
For manual installs, replace the JavaScript file and hard refresh the page.

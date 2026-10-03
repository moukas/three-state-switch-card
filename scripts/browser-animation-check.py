"""Offline Chromium regression: updates must not restart the switch transition.

Run with the existing WSL Selenium environment. Use --baseline to verify that
the committed bundle reproduces the regression; no Home Assistant is contacted.
"""
import json
from pathlib import Path
import subprocess
import sys

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

root = Path(__file__).resolve().parent.parent
source = (
    subprocess.check_output(
        ["git", "-c", f"safe.directory={root}", "show", "HEAD:dist/three-state-switch-card.js"], cwd=root
    ).decode()
    if "--baseline" in sys.argv
    else (root / "dist/three-state-switch-card.js").read_text(encoding="utf-8")
)
options = Options()
options.binary_location = "/usr/bin/chromium-browser"
for argument in ("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1200,900"):
    options.add_argument(argument)
driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
driver.set_script_timeout(30)
try:
    driver.get("data:text/html,<body style='width:600px'></body>")
    driver.execute_script(source)
    driver.execute_script("""
      customElements.define('ha-icon', class extends HTMLElement {
        connectedCallback() { if (!this.firstChild) this.append(document.createElement('span')); }
      });
    """)
    for variant, orientation, dialog in (
        ("default", "vertical", False),
        ("default", "horizontal", False),
        ("minimal", "horizontal", False),
        ("minimal", "vertical", True),
    ):
        result = driver.execute_async_script("""
          const [variant, orientation, dialog, done] = arguments;
          (async () => {
            document.querySelector('three-state-switch-card')?.remove();
            const card = document.createElement('three-state-switch-card');
            card.setConfig({entity:'input_select.test', variant, orientation,
              dialog_orientation: orientation, show_history:true, haptic:false});
            const states = {'input_select.test': {state:'On', attributes:{options:['On','Auto','Off']}}};
            let services = 0;
            const hass = {states, callService:async () => { services++; }};
            card.hass = hass;
            card._dialogOpen = dialog;
            document.body.append(card);
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            await wait(70);
            const controls = [...card.shadowRoot.querySelectorAll('.control')];
            const thumbs = controls.map(control => control.querySelector('.thumb'));
            const iconChild = thumbs[0].querySelector('ha-icon').firstChild;
            const position = (thumb, control) => {
              const matrix = new DOMMatrix(getComputedStyle(thumb).transform);
              return control.classList.contains('vertical') ? matrix.m42 : matrix.m41;
            };
            const starts = [], samples = [];
            thumbs.forEach(thumb => thumb.addEventListener('transitionrun', event => {
              if (event.propertyName === 'transform') starts.push(event.target);
            }));
            controls[0].focus();
            controls[0].dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
            const begin = performance.now();
            let acknowledged = false;
            await new Promise(resolve => {
              const frame = now => {
                const elapsed = now - begin;
                samples.push(thumbs.map((thumb, index) => position(thumb, controls[index])));
                if (elapsed > 90 && !acknowledged) {
                  states['input_select.test'] = {...states['input_select.test'],state:'Off'};
                  acknowledged = true;
                }
                // Includes unrelated hass updates, acknowledgement and history rerenders.
                card.hass = {...hass};
                if (elapsed > 140) card._queueRender();
                if (elapsed < 420) requestAnimationFrame(frame); else resolve();
              };
              requestAnimationFrame(frame);
            });
            const retained = thumbs.every((thumb,index) =>
              card.shadowRoot.querySelectorAll('.thumb')[index] === thumb && thumb.isConnected);
            const monotonic = samples.every((sample,index) => !index ||
              sample.every((value,axis) => value >= samples[index-1][axis] - 0.5));
            const ends = thumbs.map((thumb,index) => {
              const size = controls[index].classList.contains('vertical') ? thumb.offsetHeight : thumb.offsetWidth;
              return Math.abs(position(thumb,controls[index]) - 2*size) < 2;
            });
            const focusRetained = card.shadowRoot.activeElement === controls[0];
            const iconRetained = thumbs[0].querySelector('ha-icon').firstChild === iconChild;
            const movementStarts = starts.length;
            const intermediate = samples.some(sample => sample[0] > 1 &&
              sample[0] < samples.at(-1)[0] - 1);
            // Reverse while still moving: the first frame must continue at the current position.
            await card._selectIndex(0,card._options());
            await wait(80);
            const beforeReverse = position(thumbs[0],controls[0]);
            await card._selectIndex(1,card._options());
            const afterReverse = position(thumbs[0],controls[0]);
            await wait(360);
            const reverseContinuous = Math.abs(beforeReverse-afterReverse) < 1;
            const settled = controls.every(control => control.dataset.index === '1');
            // Existing handlers must be replaced, not accumulated by each render.
            const originalSelect = card._selectIndex.bind(card);
            let selections = 0;
            card._selectIndex = (...args) => { selections++; return originalSelect(...args); };
            controls[0].querySelector('.zone[data-index="0"]').click();
            await wait(20);
            card.remove();
            done({retained, monotonic, ends, movementStarts, intermediate, controls:controls.length,
              focusRetained, iconRetained, reverseContinuous, settled, services,
              selections, listenersAfterDisconnect:card._boundListeners?.length,
              samples:samples.length});
          })().catch(error => done({error:String(error),stack:error.stack}));
        """, variant, orientation, dialog)
        print(variant, orientation, "dialog=" + str(dialog), json.dumps(result), flush=True)
        assert "error" not in result, result
        assert result["retained"], "A state refresh replaced the animated thumb"
        assert result["monotonic"] and all(result["ends"]), "Motion restarted or did not settle"
        assert result["movementStarts"] == result["controls"] and result["intermediate"], result
        assert result["focusRetained"] and result["iconRetained"], result
        assert result["reverseContinuous"] and result["settled"], result
        assert result["selections"] == 1 and result["listenersAfterDisconnect"] == 0, result
    result = driver.execute_async_script("""
      const done = arguments[0];
      (async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
        const card = document.createElement('three-state-switch-card');
        const config = {entity:'input_select.test',variant:'minimal',optimistic:false,haptic:false};
        card.setConfig(config);
        const state = {state:'On',attributes:{options:['On','Auto','Off']}};
        let calls = 0;
        const hass = {states:{'input_select.test':state},callApi:async () => [],
          callService:async () => { calls++; }};
        card.hass = hass;
        document.body.append(card);
        await wait(50);
        const control = card.shadowRoot.querySelector('.control');
        const thumb = control.querySelector('.thumb');
        control.querySelector('.zone[data-index="2"]').click();
        await wait(30);
        const waitsForConfirmation = control.dataset.index === '0';
        state.state = 'Off';
        card.hass = {...hass};
        await wait(350);
        const confirms = control.dataset.index === '2' && thumb.isConnected;
        card.setConfig({...config,optimistic:true});
        hass.callService = async () => { throw new Error('test failure'); };
        card.hass = {...hass};
        await wait(20);
        control.querySelector('.zone[data-index="0"]').click();
        await wait(350);
        const rollsBack = control.dataset.index === '2' && card._pendingValue === '';
        card.shadowRoot.querySelector('.minimal-summary').click();
        await wait(20);
        const opensDialog = !!card.shadowRoot.querySelector('.switch-dialog');
        card.hass = {...hass};
        await wait(20);
        card.shadowRoot.querySelector('.dialog-history-action').click();
        await wait(30);
        const opensHistory = !!card.shadowRoot.querySelector('.history-dialog-backdrop') &&
          !card.shadowRoot.querySelector('.switch-dialog');
        card.shadowRoot.querySelector('.history-dialog-close').click();
        await wait(20);
        const closesHistory = !card.shadowRoot.querySelector('.history-dialog-backdrop');
        hass.callService = async () => { calls++; };
        card.hass = {...hass};
        card.setConfig({...config,disabled:true});
        await wait(20);
        control.querySelector('.zone[data-index="0"]').click();
        const disabled = calls === 1;
        card.setConfig(config);
        await wait(20);
        control.querySelector('.zone[data-index="0"]').click();
        await wait(20);
        const reenabled = calls === 2;
        const retained = card.shadowRoot.querySelector('.thumb') === thumb;
        card.remove();
        done({waitsForConfirmation,confirms,rollsBack,opensDialog,opensHistory,
          closesHistory,disabled,reenabled,retained});
      })().catch(error => done({error:String(error),stack:error.stack}));
    """)
    print("Lifecycle", json.dumps(result), flush=True)
    assert "error" not in result and all(result.values()), result
    print("Browser animation checks passed.")
finally:
    driver.quit()

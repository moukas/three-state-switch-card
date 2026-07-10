from pathlib import Path
from time import sleep

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By


ROOT = Path("/root/three-state-card-tools/run")
ROOT.mkdir(parents=True, exist_ok=True)


def wait_ready(driver, seconds=20):
    for _ in range(seconds):
        sleep(1)
        if driver.execute_script("return document.readyState") == "complete":
            return


def dump(driver, name):
    path = ROOT / f"{name}.png"
    driver.save_screenshot(str(path))
    print("SHOT", name, path)
    print("URL", driver.current_url)
    print("TITLE", driver.title)
    print("BODY", driver.find_element(By.TAG_NAME, "body").text[:800].replace("\n", " | "))


def click_text(driver, text):
    script = """
const target = arguments[0].trim().toLowerCase();
const seen = new Set();
const queue = [document];
while (queue.length) {
  const node = queue.shift();
  if (!node || seen.has(node)) continue;
  seen.add(node);
  const children = node.children || [];
  for (const el of children) {
    if (el.shadowRoot) queue.push(el.shadowRoot);
    queue.push(el);
    const value = (el.innerText || el.textContent || "").trim().toLowerCase();
    if (value === target || value.includes(target)) {
      el.click();
      return value;
    }
  }
}
return null;
"""
    return driver.execute_script(script, text)


def list_inputs(driver):
    script = """
const result = [];
const seen = new Set();
const queue = [document];
while (queue.length) {
  const node = queue.shift();
  if (!node || seen.has(node)) continue;
  seen.add(node);
  const children = node.children || [];
  for (const el of children) {
    if (el.shadowRoot) queue.push(el.shadowRoot);
    queue.push(el);
    if (el.tagName === 'INPUT') {
      result.push({
        type: el.type || '',
        name: el.name || '',
        autocomplete: el.autocomplete || '',
        placeholder: el.placeholder || '',
        value: el.value || ''
      });
    }
  }
}
return result;
"""
    return driver.execute_script(script)


def set_input(driver, name, value):
    script = """
const fieldName = arguments[0];
const fieldValue = arguments[1];
const seen = new Set();
const queue = [document];
while (queue.length) {
  const node = queue.shift();
  if (!node || seen.has(node)) continue;
  seen.add(node);
  const children = node.children || [];
  for (const el of children) {
    if (el.shadowRoot) queue.push(el.shadowRoot);
    queue.push(el);
    if (el.tagName === 'INPUT' && el.name === fieldName) {
      el.focus();
      el.value = fieldValue;
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return true;
    }
  }
}
return false;
"""
    return driver.execute_script(script, name, value)


def list_buttons(driver):
    script = """
const result = [];
const seen = new Set();
const queue = [document];
while (queue.length) {
  const node = queue.shift();
  if (!node || seen.has(node)) continue;
  seen.add(node);
  const children = node.children || [];
  for (const el of children) {
    if (el.shadowRoot) queue.push(el.shadowRoot);
    queue.push(el);
    if (el.tagName === 'BUTTON' || el.tagName === 'MDC-BUTTON' || el.getAttribute?.('role') === 'button') {
      result.push({
        text: (el.innerText || el.textContent || '').trim(),
        disabled: !!el.disabled,
        ariaDisabled: el.getAttribute?.('aria-disabled') || ''
      });
    }
  }
}
return result;
"""
    return driver.execute_script(script)


options = Options()
options.binary_location = "/usr/bin/chromium-browser"
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--window-size=1440,1400")

driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)

try:
    driver.get("http://127.0.0.1:8123/onboarding.html")
    wait_ready(driver)
    dump(driver, "onboarding-0")
    clicked = click_text(driver, "create my smart home")
    print("CLICKED", clicked)
    wait_ready(driver)
    sleep(2)
    dump(driver, "onboarding-1")
    print("INPUTS", list_inputs(driver))
    print("SET_NAME", set_input(driver, "name", "Codex Test"))
    print("SET_USER", set_input(driver, "username", "codex"))
    print("SET_PASS", set_input(driver, "password", "codex-test-1234"))
    print("SET_PASS2", set_input(driver, "password_confirm", "codex-test-1234"))
    print("BUTTONS_BEFORE", list_buttons(driver))
    clicked = click_text(driver, "create account")
    print("CLICKED", clicked)
    wait_ready(driver)
    sleep(3)
    dump(driver, "onboarding-2")
    print("INPUTS", list_inputs(driver))
finally:
    driver.quit()

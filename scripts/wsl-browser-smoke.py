from pathlib import Path
from time import sleep

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service


ROOT = Path("/home/martin/three-state-card-tools/run")
ROOT.mkdir(parents=True, exist_ok=True)

options = Options()
options.binary_location = "/usr/bin/chromium-browser"
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--window-size=1440,1200")

service = Service("/usr/bin/chromedriver")
driver = webdriver.Chrome(service=service, options=options)

try:
    driver.get("http://127.0.0.1:8123/")
    for _ in range(20):
        sleep(1)
        if driver.execute_script("return document.readyState") == "complete":
            break

    if "/auth/" in driver.current_url:
        fields = driver.find_elements(By.TAG_NAME, "input")
        fields[0].send_keys("codex")
        fields[1].send_keys("codex-test-1234", Keys.ENTER)
        for _ in range(30):
            sleep(1)
            if "/auth/" not in driver.current_url:
                break

    title = driver.title
    source = driver.page_source
    body_text = driver.find_element("tag name", "body").text
    screenshot = ROOT / "browser-smoke.png"
    driver.save_screenshot(str(screenshot))

    print("TITLE", title)
    print("URL", driver.current_url)
    print("BODY", body_text[:500].replace("\n", " | "))
    print("SOURCE_HAS_CARD", "three-state-switch-card" in source)
    print("SOURCE_HAS_HA", "home-assistant" in source.lower())
    print("INPUT_COUNT", len(driver.find_elements(By.TAG_NAME, "input")))
    print("SCREENSHOT", screenshot)
except WebDriverException as error:
    print("BROWSER_ERROR", error)
    raise
finally:
    driver.quit()

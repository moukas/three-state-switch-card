from time import sleep

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service


DEEP_CARDS = """
const find = (root) => {
  const cards = [...root.querySelectorAll("three-state-switch-card")];
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) cards.push(...find(element.shadowRoot));
  }
  return cards;
};
return find(document);
"""

options = Options()
options.binary_location = "/usr/bin/chromium-browser"
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--window-size=1440,1200")

driver = webdriver.Chrome(
    service=Service("/usr/bin/chromedriver"),
    options=options,
)

try:
    driver.get("http://127.0.0.1:8123/")
    if "/auth/" in driver.current_url:
        fields = []
        for _ in range(30):
            sleep(0.5)
            fields = driver.find_elements(By.TAG_NAME, "input")
            if len(fields) >= 2:
                break
        assert len(fields) >= 2, "Login fields did not appear"
        fields[0].send_keys("codex")
        fields[1].send_keys("codex-test-1234", Keys.ENTER)

    cards = []
    for _ in range(40):
        sleep(0.5)
        cards = driver.execute_script(DEEP_CARDS)
        if len(cards) >= 3:
            break
    assert len(cards) >= 3, f"Expected three custom cards, found {len(cards)}"

    results = []
    for card_index in (0, 1):
        card = cards[card_index]
        control = driver.execute_script(
            "return arguments[0].shadowRoot.querySelector('.control');", card
        )
        before = int(control.get_attribute("data-index"))
        target = (before + 1) % 3
        zone = driver.execute_script(
            "return arguments[0].shadowRoot.querySelector"
            "(`.zone[data-index='${arguments[1]}']`);",
            card,
            target,
        )
        zone.click()
        sleep(0.06)
        sample = driver.execute_script(
            """
            const control = arguments[0].shadowRoot.querySelector(".control");
            const thumb = control.querySelector(".thumb");
            return {
              orientation: control.classList.contains("vertical") ? "vertical" : "horizontal",
              index: Number(control.dataset.index),
              animationCount: thumb.getAnimations().length,
              transform: getComputedStyle(thumb).transform,
            };
            """,
            card,
        )
        results.append(sample)

    for result in results:
        print("ANIMATION", result)
        assert result["animationCount"] > 0, result
finally:
    driver.quit()

import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Tall viewport to see more content immediately, though full_page screenshot handles height
        page.set_viewport_size({"width": 1280, "height": 800})

        try:
            print("Navigating to home page...")
            # Retry connection a few times if server is slow to start
            for i in range(5):
                try:
                    page.goto("http://localhost:3000", timeout=5000)
                    break
                except Exception:
                    print(f"Server not ready, retrying {i+1}/5...")
                    time.sleep(2)

            # Wait for hero text
            print("Waiting for hero text...")
            page.wait_for_selector("text=Toyota Camry Hybrid Fleet", timeout=30000)

            # Scroll down slowly to trigger all whileInView animations
            print("Scrolling to trigger animations...")
            # Scroll in steps
            for i in range(10):
                page.mouse.wheel(0, 500)
                time.sleep(0.5)

            # Scroll back up
            page.evaluate("window.scrollTo(0, 0)")
            time.sleep(1)

            # Take screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/home_page.png", full_page=True)
            print("Screenshot saved to verification/home_page.png")

        except Exception as e:
            print(f"Error: {e}")
            # Take screenshot of error state if possible
            try:
                page.screenshot(path="verification/error_state.png")
            except:
                pass
        finally:
            browser.close()

if __name__ == "__main__":
    run()

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  console.log("Navigating to dashboard...");
  // Use a hardcoded session cookie or just try to see if it redirects
  await page.goto('http://localhost:3000/dashboard');
  
  // Wait a bit
  await page.waitForTimeout(3000);
  
  // Try to find the Pay button
  const payButtons = await page.$$('text=Pay');
  console.log(`Found ${payButtons.length} Pay buttons`);
  
  if (payButtons.length > 0) {
    console.log("Clicking first Pay button...");
    await payButtons[0].click();
    await page.waitForTimeout(2000);
    
    // Look for Proceed to Pay
    const proceedButtons = await page.$$('text=Proceed to Pay');
    if (proceedButtons.length > 0) {
      console.log("Entering amount and clicking Proceed...");
      await page.fill('input[type="number"]', '100');
      await proceedButtons[0].click();
      await page.waitForTimeout(5000);
    } else {
      console.log("Proceed to Pay button not found");
    }
  }
  
  await browser.close();
})();

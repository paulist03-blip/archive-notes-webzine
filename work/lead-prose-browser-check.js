async (page) => {
  const base = 'http://127.0.0.1:8873';
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const routes = await page.locator('a:has(.essay-date)').evaluateAll(links => links.filter(a => {
    const issue = +(a.textContent.match(/Issue (\d+)/)?.[1] || 0);
    return issue >= 51 && issue <= 72;
  }).map(a => new URL(a.href).pathname));
  if (routes.length !== 22) throw new Error('Expected 22 issue links');
  const results = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.locator('.article-body').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
        return {
          route: location.pathname, width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          title: document.querySelector('h1')?.textContent,
          paragraphs: document.querySelectorAll('.article-body > p').length,
          images: [...document.images].map(i => ({ src: i.getAttribute('src'), naturalWidth: i.naturalWidth }))
        };
      });
      if (result.scrollWidth > width || result.images.some(i => !i.naturalWidth)) throw new Error(JSON.stringify(result));
      results.push(result);
    }
  }
  await page.screenshot({ path: 'output/playwright/leads-51-72-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + routes[0], { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: 'output/playwright/leads-51-72-desktop.png', fullPage: true });
  return { passed: true, checks: results.length, results };
}

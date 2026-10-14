async (page) => {
  const base = 'http://127.0.0.1:8876';
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const routes = await page.locator('a:has(.essay-date)').evaluateAll(links => links.filter(a => {
    const issue = +(a.textContent.match(/Issue (\d+)/)?.[1] || 0);
    return issue >= 31 && issue <= 50;
  }).map(a => new URL(a.href).pathname));
  if (routes.length !== 20) throw new Error('Expected 20 main essays');
  const results = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      if (response.status() !== 200) throw new Error(route);
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(async () => {
        await Promise.all([...document.images].map(img => Promise.race([img.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 8000))])));
        return {
          route: location.pathname, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          title: document.querySelector('h1')?.textContent,
          paragraphs: document.querySelectorAll('.article-body > p').length,
          forbidden: /아니라|멈추|멈춰|말라는\s*요구/.test(document.querySelector('.article-body').textContent),
          images: [...document.images].map(img => ({ src: img.getAttribute('src'), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }))
        };
      });
      if (result.scrollWidth > width || result.forbidden || result.images.some(img => !img.naturalWidth)) throw new Error(JSON.stringify(result));
      results.push(result);
      if (/seurat-circus-sideshow|monet-coalmen/.test(route)) await page.screenshot({ path: `output/playwright/leads-31-50-${route.includes('seurat') ? '31' : '50'}-${width}.png` });
    }
  }
  return { passed: true, checks: results.length, results };
}

async (page) => {
  const base = new URL(page.url()).origin;
  const href = 'https://paul-reading-room.politeelm64.chatgpt.site/#books';
  const artHref = 'https://haru-art-journal.politeelm64.chatgpt.site';
  const paths = [
    '/', '/archive.html', '/book-archive.html', '/book-review-board.html',
    '/apple-tv-review.html',
    '/posts/cezanne-mont-sainte-victoire-met.html',
    '/posts/issue-08-computing-machine-moving-human.html',
    '/posts/frankopan-silk-roads-world-history.html',
  ];
  const results = [];
  await page.route('**/api/translate', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"not_configured"}',
  }));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      const response = await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]));
      const link = page.locator('footer a').filter({ hasText: '폴의 독서실' });
      await link.scrollIntoViewIfNeeded();
      const data = await link.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return {
          href: node.href, target: node.target, rel: node.rel,
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          count: document.querySelectorAll('footer a[href="' + node.href + '"]').length,
          cadenza: [...document.querySelectorAll('a[href]')].filter(a => a.hostname === 'the-cadenza-seoul.paulist03.chatgpt.site').length,
        };
      });
      if (response.status() !== 200 || data.count !== 1 || data.href !== href || data.target !== '_blank' ||
          !data.rel.includes('noopener') || !data.rel.includes('noreferrer') || data.cadenza ||
          data.left < 0 || data.right > width + 1 || data.top < 0 || data.bottom > 901) {
        throw new Error(JSON.stringify({ path, width, status: response.status(), ...data }));
      }
      results.push({ path, width, status: response.status(), ...data });
      const art = page.locator('footer a[href="' + artHref + '"]');
      await art.scrollIntoViewIfNeeded();
      const bounds = await art.boundingBox();
      if (await art.count() !== 1 || !bounds || bounds.x < 0 || bounds.x + bounds.width > width + 1) throw new Error('Artwork link bounds: ' + path);
      if (['/', '/posts/cezanne-mont-sainte-victoire-met.html', '/posts/issue-08-computing-machine-moving-human.html'].includes(path)) {
        const slug = path === '/' ? 'home' : path.split('/').pop().replace('.html', '');
        await page.screenshot({ path: 'output/playwright/footer-' + slug + '-' + width + '.png' });
      }
    }
  }
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'English', exact: true }).click();
  const english = page.locator('footer a[href="' + href + '"]');
  await english.scrollIntoViewIfNeeded();
  await page.waitForFunction(url => document.querySelector('footer a[href="' + url + '"]').textContent === "Paul's Reading Room", href);
  await page.getByRole('button', { name: '한국어', exact: true }).click();
  await page.waitForFunction(url => document.querySelector('footer a[href="' + url + '"]').textContent === '폴의 독서실', href);
  return { base, checks: results, englishLabel: true, koreanRestored: true, artHref };
}

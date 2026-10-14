async (page) => {
  const base = new URL(page.url()).origin;
  const publicSite = base.startsWith('https:');
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const issues = await page.locator('a:has(.essay-date)').evaluateAll(links => links.map(link => ({
    number: Number(link.querySelector('.essay-date').textContent.match(/Issue (\d+)/)[1]),
    path: new URL(link.href).pathname
  })).sort((a, b) => a.number - b.number));
  if (issues.length !== 72) throw new Error('Expected 72 issues');
  const route = issue => base + (publicSite ? issue.path.replace(/\.html$/, '') : issue.path);
  const samples = publicSite ? [issues[0], issues[32], issues[49], issues.at(-1)] : issues;
  const checks = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const issue of samples) {
      const response = await page.goto(route(issue), { waitUntil: 'domcontentloaded' });
      if (response.status() !== 200) throw new Error('HTTP failure: ' + issue.number);
      await page.evaluate(() => document.fonts.ready);
      const nav = page.locator('.issue-pagination');
      await nav.scrollIntoViewIfNeeded();
      const result = await nav.evaluate((element, number) => {
        const navRect = element.getBoundingClientRect();
        const links = [...element.querySelectorAll('a')].map(link => {
          const rect = link.getBoundingClientRect();
          const title = link.querySelector('.issue-pagination-title');
          const titleRect = title.getBoundingClientRect();
          return { rel: link.rel, href: link.getAttribute('href'), title: title.textContent,
            x: rect.x, right: rect.right, y: rect.y, height: rect.height,
            fits: title.scrollWidth <= title.clientWidth + 1 && titleRect.left >= rect.left - 1 && titleRect.right <= rect.right + 1 };
        });
        return { number, overflow: document.documentElement.scrollWidth > innerWidth,
          count: document.querySelectorAll('.issue-pagination').length,
          links, midpoint: (navRect.left + navRect.right) / 2,
          afterBody: document.querySelector('.article-body').getBoundingClientRect().bottom <= navRect.top + 1 };
      }, issue.number);
      const index = issues.findIndex(a => a.number === issue.number);
      const expected = [index > 0 ? 'prev' : null, index < issues.length - 1 ? 'next' : null].filter(Boolean);
      if (result.overflow || !result.afterBody || result.count !== 1 || result.links.length !== expected.length) throw new Error(JSON.stringify(result));
      for (const link of result.links) {
        const neighbor = issues[index + (link.rel === 'prev' ? -1 : 1)];
        if (!link.fits || link.height < 44 || !link.title.trim() || link.href !== neighbor.path.split('/').at(-1)) throw new Error(JSON.stringify(result));
        if (link.rel === 'prev' && link.right > result.midpoint || link.rel === 'next' && link.x < result.midpoint) throw new Error('Incorrect left/right placement');
      }
      if ([1, 33, 50, 72].includes(issue.number)) {
        await page.evaluate(() => window.scrollBy(0, -150));
        await page.screenshot({ path: `output/playwright/issue-navigation-${publicSite ? 'public' : 'local'}-${issue.number}-${width}.png` });
      }
      checks.push({ issue: issue.number, width, links: result.links.length });
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  for (const index of [0, 32, 49, 71]) {
    await page.goto(route(issues[index]), { waitUntil: 'domcontentloaded' });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('320px overflow');
  }
  await page.goto(route(issues[49]), { waitUntil: 'domcontentloaded' });
  await page.locator('.issue-pagination-link--prev').click();
  await page.waitForURL(route(issues[48]));
  await page.locator('.issue-pagination-link--next').click();
  await page.waitForURL(route(issues[49]));
  await page.locator('.issue-pagination-link--prev').focus();
  await page.keyboard.press('Tab');
  if (!(await page.locator('.issue-pagination-link--next').evaluate(element => document.activeElement === element && getComputedStyle(element).outlineStyle !== 'none'))) throw new Error('Keyboard focus failed');
  await page.goto(route(issues[71]), { waitUntil: 'domcontentloaded' });
  await page.locator('.issue-pagination-link--prev').click();
  await page.waitForURL(route(issues[70]));
  const context = await page.context().browser().newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await context.newPage();
  try {
    for (const index of [0, 49, 71]) {
      await staticPage.goto(route(issues[index]), { waitUntil: 'domcontentloaded' });
      if (!(await staticPage.locator('.issue-pagination').isVisible())) throw new Error('No-JS navigation absent');
    }
    await staticPage.locator('.issue-pagination-link--prev').click();
    await staticPage.waitForURL(route(issues[70]));
  } finally { await context.close(); }
  await page.goto(base + '/posts/bach-music-castle-heaven-gardiner' + (publicSite ? '' : '.html'), { waitUntil: 'domcontentloaded' });
  if (await page.locator('.issue-pagination').count()) throw new Error('Non-issue post modified');
  return { passed: true, site: base, viewportChecks: checks.length, narrowViewportChecks: 4,
    actualNavigationClicks: 4, keyboardFocus: true, withoutJavaScript: true, nonIssueUnchanged: true };
}

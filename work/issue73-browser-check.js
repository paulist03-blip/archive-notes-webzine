async (page) => {
  const base = new URL(page.url()).origin;
  const publicSite = base.startsWith('https:');
  const slugs = ['hammershoi-interior-strandgade-30-issue73', 'praetzellis-archaeological-theory-issue73',
    'benjamin-radio-media-issue73', 'rousseau-judge-jean-jacques-issue73', 'chopin-complete-etudes-lortie-issue73'];
  const routes = ['/', ...slugs.map(s => '/posts/' + s + (publicSite ? '' : '.html'))];
  const results = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('h1').waitFor();
      await page.evaluate(async () => {
        const selected = [...document.querySelectorAll('.hero-image img, .article-cover img, .article-mobile-artwork img')];
        await Promise.all(selected.map(img => img.decode()));
        await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]);
      });
      const result = await page.evaluate(() => ({
        route: location.pathname, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        title: document.querySelector('h1').textContent,
        paragraphs: document.querySelectorAll('.article-body > p:not(.article-signoff)').length,
        images: [...document.querySelectorAll('.hero-image img, .article-cover img, .article-mobile-artwork img')].map(img => ({
          src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight,
        })),
        navigation: [...document.querySelectorAll('.issue-pagination a')].map(a => ({ title: a.textContent, href: a.getAttribute('href') })),
        readingRoom: !!document.querySelector('footer a[href*="paul-reading-room"]'),
        artworkJournal: !!document.querySelector('footer a[href*="haru-art-journal"]'),
      }));
      if (response.status() !== 200 || result.scrollWidth > width || result.images.some(i => !i.width) ||
          !result.readingRoom || !result.artworkJournal || (route !== '/' && result.paragraphs !== 13)) throw new Error(JSON.stringify(result));
      if (route.includes(slugs[0]) && (result.navigation.length !== 1 || !result.navigation[0].title.includes('72호'))) throw new Error('Latest issue navigation mismatch');
      if (route === '/' && !(await page.locator('[data-issue="73"]').count())) throw new Error('Homepage is not Issue 73');
      results.push(result);
      if (route === '/' || route.includes(slugs[0]) || route.includes(slugs[4])) {
        await page.screenshot({ path: `output/playwright/issue73-${publicSite ? 'public' : 'local'}-${route === '/' ? 'home' : route.includes(slugs[0]) ? 'lead' : 'record'}-${width}.png` });
      }
    }
  }
  await page.goto(base + '/posts/' + slugs[0] + (publicSite ? '' : '.html'), { waitUntil: 'domcontentloaded' });
  const previous = page.locator('.issue-pagination a[rel="prev"]');
  await previous.click();
  await page.locator('.issue-pagination a[rel="next"]').waitFor();
  if (!(await page.locator('.issue-pagination a[rel="next"]').getAttribute('href')).includes(slugs[0])) throw new Error('Previous issue lacks next link');
  await page.locator('.issue-pagination a[rel="next"]').click();
  if (!(await page.locator('h1').textContent()).includes('열린 문 너머의 사람')) throw new Error('Round trip failed');
  return { passed: true, checks: results.length, results, roundTrip: true, errors };
}

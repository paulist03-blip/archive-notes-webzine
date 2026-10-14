async (page) => {
  const base = 'http://127.0.0.1:8875';
  const files = [
    'posts/bach-music-castle-heaven-gardiner.html',
    'posts/vietnam-war-wawro.html',
    'posts/entropy-and-economics.html',
    'posts/psychology-and-alchemy-jung.html',
    'posts/sennett-flesh-and-stone.html',
    'posts/shutaro-mukai-design-studies.html',
    'posts/peter-watson-convergence.html',
    'posts/from-signal-to-symbol-ai-pragmatics.html',
    'posts/weimar-republic-dissolution-bracher.html',
    'pettit-neorepublicanism-report.html',
    'posts/sleepwalkers-christopher-clark.html',
    'posts/everything-was-forever-yurchak.html',
    'posts/book-of-disquiet-pessoa.html',
    'posts/frankopan-silk-roads-world-history.html',
    'posts/napoleon-world-history-mikaberidze.html'
  ];
  const results = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const file of files) {
      const response = await page.goto(base + '/' + file, { waitUntil: 'domcontentloaded' });
      if (response.status() !== 200) throw new Error(file);
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(async () => {
        await Promise.all([...document.images].map(img => Promise.race([img.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000))])));
        return {
          route: location.pathname, width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          title: document.querySelector('h1')?.textContent,
          paragraphs: document.querySelectorAll('.article-body > p, main .section p').length,
          forbidden: /아니라|말라는\s*요구|멈추|멈춰/.test((document.querySelector('.article-body') || document.querySelector('main'))?.textContent || ''),
          images: [...document.images].map(img => ({ src: img.getAttribute('src'), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }))
        };
      });
      if (result.scrollWidth > width || result.forbidden) throw new Error(JSON.stringify(result));
      if (file === files[0] && !result.images.some(img => img.naturalWidth === 822 && img.naturalHeight === 1200)) throw new Error('Bach cover dimensions');
      results.push(result);
      if (file === files[0]) await page.screenshot({ path: `output/playwright/contribution-bach-${width}.png`, fullPage: true });
    }
    await page.goto(base + '/index.html#contribution', { waitUntil: 'domcontentloaded' });
    const card = page.locator('.contribution-history .feature-card').first();
    await card.scrollIntoViewIfNeeded();
    if (!(await card.getAttribute('href')).includes('bach-music-castle-heaven-gardiner')) throw new Error('Contribution placement');
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error('Home overflow');
    await page.screenshot({ path: `output/playwright/contribution-home-${width}.png` });
    for (const file of ['archive.html', 'book-archive.html']) {
      await page.goto(base + '/' + file, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(file + ' overflow');
      if (file === 'archive.html' && await page.locator('#contribution-archive a[href="posts/bach-music-castle-heaven-gardiner.html"]').count() !== 1) throw new Error('Archive placement');
      if (file === 'book-archive.html' && await page.locator('.book-daily-card a[href="posts/bach-music-castle-heaven-gardiner.html"]').count()) throw new Error('Bach still in daily picks');
    }
  }
  return { passed: true, articleChecks: results.length, listChecks: 6, results };
}

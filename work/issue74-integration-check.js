async (page) => {
  const base = new URL(page.url()).origin;
  const publicSite = base.startsWith('https:');
  await page.goto(base + '/book-archive' + (publicSite ? '' : '.html'), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-book-daily] .book-daily-card').first().waitFor();
  const picks = await page.locator('[data-book-daily] .book-daily-card').evaluateAll(cards => cards.slice(0, 3).map(card => ({
    text: card.textContent, links: [...card.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
  })));
  const slugs = ['aragon-paris-peasant-issue74', 'barthes-lovers-discourse-issue74', 'russell-freedom-organization-issue74'];
  if (picks.length !== 3 || picks.some((p, i) => !p.links.some(href => href.includes(slugs[i])))) throw new Error('Daily picks mismatch');
  for (const title of ['자유와 조직']) {
    await page.locator('[data-book-search]').fill(title);
    await page.waitForFunction(text => [...document.querySelectorAll('[data-book-list] a')].some(a => a.textContent.includes(text)), title);
    const targets = await page.locator('[data-book-list] a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')));
    if (!targets.some(href => href.includes('issue74'))) throw new Error('Completed review link missing: ' + title);
  }
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const record = page.locator('#notes a.archive-row[href*="schumann-dichterliebe-finley-drake-issue74"]');
  await record.click();
  await page.locator('.mini-player iframe[src*="1697992547"]').waitFor({ state: 'attached', timeout: 20000 });
  const player = await page.locator('.mini-player iframe').getAttribute('src');
  if (!player.includes('embed.music.apple.com')) throw new Error('Invalid album player');
  return { passed: true, dailyPicks: 3, completedReviewSearches: 1, player };
}

async (page) => {
  const base = new URL(page.url()).origin;
  const publicSite = base.startsWith('https:');
  await page.goto(base + '/book-archive' + (publicSite ? '' : '.html'), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-book-daily] .book-daily-card').first().waitFor();
  const picks = await page.locator('[data-book-daily] .book-daily-card').evaluateAll(cards => cards.slice(0, 3).map(card => ({
    text: card.textContent, links: [...card.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
  })));
  const slugs = ['praetzellis-archaeological-theory-issue73', 'benjamin-radio-media-issue73', 'rousseau-judge-jean-jacques-issue73'];
  if (picks.length !== 3 || picks.some((p, i) => !p.links.some(href => href.includes(slugs[i])))) throw new Error('Daily picks mismatch');
  for (const title of ['고고학이론 껍질 깨기', '루소, 장 자크를 심판하다']) {
    await page.locator('[data-book-search]').fill(title);
    await page.waitForFunction(text => [...document.querySelectorAll('[data-book-list] a')].some(a => a.textContent.includes(text)), title);
    const targets = await page.locator('[data-book-list] a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')));
    if (!targets.some(href => href.includes('issue73'))) throw new Error('Completed review link missing: ' + title);
  }
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const record = page.locator('#notes a.archive-row[href*="chopin-complete-etudes-lortie-issue73"]');
  await record.click();
  await page.locator('.mini-player iframe[src*="1761610862"]').waitFor({ state: 'attached', timeout: 20000 });
  const player = await page.locator('.mini-player iframe').getAttribute('src');
  if (!player.includes('embed.music.apple.com')) throw new Error('Invalid album player');
  return { passed: true, dailyPicks: 3, completedReviewSearches: 2, player };
}

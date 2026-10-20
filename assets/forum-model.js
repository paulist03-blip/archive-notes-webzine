export const LIMITS = Object.freeze({ title: 120, work: 160, body: 20000, reply: 12000 });
export const CATEGORIES = ['미술', '책', '음반', '자유'];
export const REPORT_REASONS = ['욕설·혐오', '개인정보', '광고·도배', '기타'];
export function validatePost(value) {
  const post = Object.fromEntries(['title', 'work', 'category', 'body'].map(key => [key, String(value[key] || '').trim()]));
  if (!post.title || post.title.length > LIMITS.title) throw new Error('제목을 120자 이내로 입력해 주세요.');
  if (!post.work || post.work.length > LIMITS.work) throw new Error('작품 이름을 160자 이내로 입력해 주세요.');
  if (!CATEGORIES.includes(post.category)) throw new Error('분류를 선택해 주세요.');
  if (!post.body || post.body.length > LIMITS.body) throw new Error('감상은 1자부터 20,000자까지 남길 수 있습니다.');
  return post;
}
export function validateReply(body) {
  const value = String(body || '').trim();
  if (!value || value.length > LIMITS.reply) throw new Error('답글은 1자부터 12,000자까지 남길 수 있습니다.');
  return value;
}
export function filterPosts(posts, category, search) {
  const needle = String(search || '').normalize('NFKC').toLocaleLowerCase();
  return posts.filter(post => (category === '전체' || post.category === category) &&
    [post.title, post.work, post.body].join(' ').normalize('NFKC').toLocaleLowerCase().includes(needle));
}
export function hasConfiguration(config) {
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every(key => Boolean(config?.firebase?.[key]));
}

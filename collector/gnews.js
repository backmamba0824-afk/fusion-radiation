const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Google News のリダイレクトURL (news.google.com/rss/articles/...) を
 * 元記事の実URLに解決する。
 * 同じ記事でも Google News 経由だと検索クエリごとに異なるURLになるため、
 * 実URLに揃えないと重複除去・全文取得・サムネイル取得がすべて機能しない。
 *
 * 旧形式: Base64のIDにURLがそのまま埋め込まれている → デコードのみ
 * 新形式 (2024年〜): 記事ページから署名を取り、内部API (batchexecute) に問い合わせる
 *
 * @param {Array} articles - { url, ... } の配列（その場で url を書き換える）
 * @returns {Array} 同じ配列（url 解決済み。失敗した記事は元のURLのまま）
 */
export async function resolveGoogleNewsUrls(articles) {
  const targets = articles.filter(a => a.url?.includes('news.google.com/rss/articles/'));
  if (targets.length === 0) return articles;

  console.log(`🔗 Google News URL解決中: ${targets.length}件`);

  const cache = new Map();
  let resolved = 0;
  const concurrency = 4;

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(batch.map(async (article) => {
      if (!cache.has(article.url)) {
        cache.set(article.url, await resolveOne(article.url));
      }
      const realUrl = cache.get(article.url);
      if (realUrl) {
        article.url = realUrl;
        resolved++;
      }
    }));
  }

  console.log(`  ✅ ${resolved}/${targets.length}件を実URLに解決`);
  return articles;
}

async function resolveOne(url) {
  const direct = tryDirectDecode(url);
  if (direct) return direct;

  try {
    return await resolveViaApi(url);
  } catch {
    return null;
  }
}

/**
 * 旧形式: Base64デコードだけでURLが取り出せるケース
 */
function tryDirectDecode(url) {
  try {
    const match = url.match(/articles\/([^?&#]+)/);
    if (!match) return null;
    const id = match[1];
    const padded = id + '='.repeat((4 - (id.length % 4)) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\\]+/);
    return urlMatch ? urlMatch[0] : null;
  } catch {
    return null;
  }
}

/**
 * 新形式: 記事ページの data-n-a-sg / data-n-a-ts を使って
 * batchexecute API から実URLを取得
 */
async function resolveViaApi(url) {
  const match = url.match(/articles\/([^?&#]+)/);
  if (!match) return null;
  const articleId = match[1];

  const pageRes = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) return null;

  const payload = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${ts},"${sg}"]`;
  const body = new URLSearchParams({
    'f.req': JSON.stringify([[['Fbv4je', payload, null, 'generic']]]),
  });

  const apiRes = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': UA,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!apiRes.ok) return null;

  const text = await apiRes.text();
  for (const line of text.split('\n')) {
    if (!line.startsWith('[[')) continue;
    try {
      const outer = JSON.parse(line);
      const inner = JSON.parse(outer[0][2]);
      const realUrl = inner?.[1];
      if (typeof realUrl === 'string' && realUrl.startsWith('http')) return realUrl;
    } catch {
      // 次の行を試す
    }
  }
  return null;
}

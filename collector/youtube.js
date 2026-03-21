const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTubeチャンネルから最新動画を収集
 * @param {Array} channels - { name, channelId, category } の配列
 * @param {number} hoursBack - 何時間前までの動画を取得するか
 * @returns {Array} 収集した記事の配列
 */
export async function collectYouTube(channels, hoursBack = 24) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.log('⚠️ YOUTUBE_API_KEY が未設定のため、YouTube収集をスキップ');
    return [];
  }

  const hours = isNaN(hoursBack) || hoursBack <= 0 ? 24 : hoursBack;
  const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  const allArticles = [];

  for (const channel of channels) {
    try {
      console.log(`🎬 YouTube取得中: ${channel.name}`);

      const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
      searchUrl.searchParams.set('key', apiKey);
      searchUrl.searchParams.set('channelId', channel.channelId);
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('order', 'date');
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('maxResults', '10');
      searchUrl.searchParams.set('publishedAfter', cutoffDate.toISOString());

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        throw new Error(`API応答: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const articles = (data.items || []).map((item) => ({
        sourceName: `YouTube - ${channel.name}`,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        content: item.snippet.description || '',
        category: channel.category,
        author: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.high?.url
          || item.snippet.thumbnails?.medium?.url
          || item.snippet.thumbnails?.default?.url
          || null,
      }));

      allArticles.push(...articles);
      console.log(`  ✅ ${articles.length}件取得`);
    } catch (error) {
      console.error(`  ❌ YouTube取得エラー (${channel.name}): ${error.message}`);
    }
  }

  console.log(`🎬 YouTube合計: ${allArticles.length}件`);
  return allArticles;
}

import { YoutubeTranscript } from 'youtube-transcript';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTubeチャンネルから最新動画を収集（字幕付き）
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

      const response = await fetch(searchUrl.toString(), {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`API応答: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const articles = await Promise.all(
        (data.items || []).map(async item => {
          const videoId = item.id.videoId;
          const transcriptText = await fetchTranscript(videoId);

          return {
            sourceName: `YouTube - ${channel.name}`,
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            content: item.snippet.description || '',
            transcriptText,
            category: channel.category,
            author: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            thumbnail:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              null,
          };
        })
      );

      allArticles.push(...articles);
      console.log(`  ✅ ${articles.length}件取得 (字幕あり: ${articles.filter(a => a.transcriptText).length}件)`);
    } catch (error) {
      console.error(`  ❌ YouTube取得エラー (${channel.name}): ${error.message}`);
    }
  }

  console.log(`🎬 YouTube合計: ${allArticles.length}件`);
  return allArticles;
}

/**
 * 動画の字幕を取得（日本語優先、英語フォールバック）
 */
async function fetchTranscript(videoId) {
  for (const lang of ['ja', 'en']) {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      if (segments && segments.length > 0) {
        const text = segments.map(s => s.text).join(' ');
        return text.slice(0, 8000);
      }
    } catch {
      // 次の言語を試す
    }
  }
  return null;
}

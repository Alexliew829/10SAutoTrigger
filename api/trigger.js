# 构建 updated trigger.js 内容，关键词判断逻辑为：等于 start 或 on（不分大小写）
final_trigger_js = """
const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_TABLE_NAME = process.env.SUPABASE_TABLE_NAME;
const TRIGGER_KEYWORDS = ['start', 'on'];

export default async function handler(req, res) {
  try {
    const postsRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${ACCESS_TOKEN}&limit=1`);
    const postsData = await postsRes.json();
    const post = postsData.data?.[0];

    if (!post) {
      return res.status(200).json({ message: 'No post found' });
    }

    const postId = post.id;

    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE_NAME}?post_id=eq.${postId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const checkData = await checkRes.json();
    if (checkData.length > 0) {
      return res.status(200).json({ message: 'Already triggered for this post' });
    }

    const commentsRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}&fields=message,from,created_time`);
    const commentsData = await commentsRes.json();
    const comments = commentsData.data || [];

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    for (const comment of comments) {
      const message = comment.message?.toLowerCase().trim();
      const fromId = comment.from?.id;
      const createdTime = new Date(comment.created_time);
      const isFromPage = fromId === PAGE_ID;
      const equalsKeyword = TRIGGER_KEYWORDS.some(keyword => message === keyword);
      const isRecent = createdTime > tenMinutesAgo;

      if (isFromPage && equalsKeyword && isRecent) {
        await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'System On，欢迎来到情人传奇🌿'
          }),
        });

        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: postId })
        });

        await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE_NAME}`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ post_id: postId }),
        });

        return res.status(200).json({ message: 'System On triggered', postId });
      }
    }

    return res.status(200).json({ message: 'No matching trigger keywords found' });
  } catch (err) {
    console.error('Error in trigger.js:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
"""

# 写入最终 trigger.js 文件
with open("/mnt/data/api/trigger.js", "w") as f:
    f.write(final_trigger_js.strip())

# 打包为最终 ZIP
final_zip_path = "/mnt/data/final_trigger_exact_match.zip"
with zipfile.ZipFile(final_zip_path, 'w') as zipf:
    zipf.write("/mnt/data/api/trigger.js", arcname="api/trigger.js")

final_zip_path

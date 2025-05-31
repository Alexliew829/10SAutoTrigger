const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_TABLE_NAME = process.env.SUPABASE_TABLE_NAME;
const TRIGGER_KEYWORDS = ['start', 'on'];

export default async function handler(req, res) {
  try {
    // 获取主页最新一篇贴文（含发布时间）
    const postsRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${ACCESS_TOKEN}&limit=1&fields=created_time`);
    const postsData = await postsRes.json();
    const post = postsData.data?.[0];

    if (!post) {
      return res.status(200).json({ message: 'No post found' });
    }

    const postId = post.id;
    const postCreatedTime = new Date(post.created_time);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // 忽略超过30分钟的旧贴文
    if (postCreatedTime < thirtyMinutesAgo) {
      return res.status(200).json({ message: 'Post too old, ignored', postId });
    }

    // 判断是否已经触发过
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

    // 获取留言列表
    const commentsRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}&fields=message,from,created_time`);
    const commentsData = await commentsRes.json();
    const comments = commentsData.data || [];

    const now = new Date();
    const thirtyMinutesAgoComment = new Date(now.getTime() - 30 * 60 * 1000);

    for (const comment of comments) {
      const message = comment.message?.toLowerCase().trim();
      const fromId = comment.from?.id;
      const createdTime = new Date(comment.created_time);
      const isFromPage = fromId === PAGE_ID;
      const equalsKeyword = TRIGGER_KEYWORDS.includes(message);
      const isRecent = createdTime > thirtyMinutesAgoComment;

      if (isFromPage && equalsKeyword && isRecent) {
        // 自动留言 “System On”
        await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'System On，欢迎来到情人传奇🌿'
          }),
        });

        // 通知 Make Webhook
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: postId })
        });

        // 写入 Supabase，防止重复触发
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

    return res.status(200).json({ message: 'No matching comment found', postId });
  } catch (err) {
    console.error('Error in trigger.js:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

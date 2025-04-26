// 获取Spaces列表的API
export async function onRequest(context) {
  try {
    // 从环境变量获取HF API令牌
    const apiToken = context.env.HF_API_TOKEN;
    
    if (!apiToken) {
      return new Response(JSON.stringify({
        error: 'API令牌未配置'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 从Hugging Face获取Spaces列表
    const response = await fetch('https://huggingface.co/api/spaces', {
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取Spaces列表失败: ${response.status}`);
    }
    
    const spaces = await response.json();
    
    // 如果在环境变量中设置了过滤用户名，则过滤结果
    const filterUsernames = (context.env.HF_USERNAMES || '').split(',').map(u => u.trim()).filter(Boolean);
    
    let filteredSpaces = spaces;
    if (filterUsernames.length > 0) {
      filteredSpaces = spaces.filter(space => filterUsernames.includes(space.username));
    }
    
    return new Response(JSON.stringify(filteredSpaces), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取Spaces列表错误:', error);
    return new Response(JSON.stringify({
      error: '获取Spaces列表失败: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
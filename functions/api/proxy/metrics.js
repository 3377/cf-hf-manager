// 获取Space监控指标的API
export async function onRequest(context) {
  // 验证是否已通过认证
  if (!context.session) {
    return new Response(JSON.stringify({
      error: '未授权操作'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // 获取Space ID
    const url = new URL(context.request.url);
    const spaceId = url.searchParams.get('spaceId');
    
    if (!spaceId) {
      return new Response(JSON.stringify({
        error: '缺少Space ID'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
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
    
    // 调用Hugging Face API获取Space监控指标
    const response = await fetch(`https://huggingface.co/api/spaces/${spaceId}/runtime/metrics`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`获取监控指标失败: ${response.status} - ${error}`);
    }
    
    const metrics = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      data: metrics
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('获取监控指标错误:', error);
    return new Response(JSON.stringify({
      error: '获取监控指标失败: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
// 更新监控订阅的API
// 这个API允许客户端动态更新其监控的Space列表
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
    // 解析请求体
    const body = await context.request.json();
    const { clientId, instances } = body;
    
    if (!clientId || !Array.isArray(instances)) {
      return new Response(JSON.stringify({
        error: '请求格式不正确，需要提供clientId和instances数组'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 在实际的实现中，这里应该将订阅信息存储在某个地方
    // 例如KV存储或Durable Object
    // 当前实现仅返回成功响应，但实际上没有存储订阅信息
    
    // 为了简化，我们可以在KV中存储当前客户端的订阅
    const key = `metrics_subscription:${clientId}`;
    await context.env.SESSIONS.put(key, JSON.stringify({
      clientId,
      instances,
      updated: Date.now()
    }), {
      expirationTtl: 3600 // 1小时过期
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: '订阅已更新',
      subscribed: instances.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('更新订阅错误:', error);
    return new Response(JSON.stringify({
      error: '更新订阅失败: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
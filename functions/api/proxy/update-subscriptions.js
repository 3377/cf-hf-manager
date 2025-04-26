// 更新监控订阅的API
// 这个API允许客户端动态更新其监控的Space列表
export async function onRequest(context) {
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
    
    console.log(`更新监控订阅: 客户端ID ${clientId}, 实例数量 ${instances.length}`);
    
    // 在Cloudflare Pages中，我们可以使用KV存储保存订阅信息
    // 如果没有配置SESSIONS环境变量，则只记录日志不存储
    if (context.env.SESSIONS) {
      const key = `metrics_subscription:${clientId}`;
      try {
        await context.env.SESSIONS.put(key, JSON.stringify({
          clientId,
          instances,
          updated: Date.now()
        }), {
          expirationTtl: 3600 // 1小时过期
        });
        console.log(`成功存储订阅信息到KV，键: ${key}`);
      } catch (kvError) {
        console.error(`KV存储订阅信息失败:`, kvError);
        // 继续执行，不中断响应
      }
    } else {
      console.log(`SESSIONS KV未配置，无法持久化存储订阅信息`);
    }
    
    // 即使没有存储，也返回成功响应
    // 因为我们的SSE实现是基于URL查询参数的，不依赖于服务器端存储
    return new Response(JSON.stringify({
      success: true,
      message: '订阅请求已处理',
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
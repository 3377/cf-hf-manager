// 更新监控订阅的API
// 这个API允许客户端动态更新其监控的Space列表
export async function onRequest(context) {
  try {
    // 验证HTTP方法
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '方法不允许' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'POST'
        }
      });
    }
    
    // 获取并验证认证令牌
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        error: '未提供有效的认证令牌'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return new Response(JSON.stringify({
        error: '无效的令牌格式'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 从KV存储中获取会话
    let session;
    try {
      const sessionData = await context.env.SESSIONS.get(`session:${token}`);
      if (!sessionData) {
        return new Response(JSON.stringify({
          error: '无效或过期的会话'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      session = JSON.parse(sessionData);
      const now = Date.now();
      
      // 检查会话是否过期
      if (session.expires < now) {
        // 删除过期会话
        await context.env.SESSIONS.delete(`session:${token}`);
        return new Response(JSON.stringify({
          error: '会话已过期，请重新登录'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('验证会话错误:', error);
      return new Response(JSON.stringify({
        error: '会话验证失败'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
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
          username: session.username,
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
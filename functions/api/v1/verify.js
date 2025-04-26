// 验证会话有效性的API端点
export async function onRequest(context) {
  // 只允许GET请求
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ error: '方法不允许' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'GET'
      }
    });
  }

  try {
    // 从请求头获取令牌
    const authHeader = context.request.headers.get('Authorization');
    
    // 如果没有提供令牌，返回401
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '未授权访问' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 提取令牌
    const token = authHeader.split(' ')[1];
    
    // 从KV获取会话
    const sessionData = await context.env.SESSIONS.get(`session:${token}`);
    
    // 如果没有找到会话
    if (!sessionData) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '会话无效' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解析会话数据
    const session = JSON.parse(sessionData);
    
    // 检查会话是否过期
    if (session.expires < Date.now()) {
      // 删除过期会话
      await context.env.SESSIONS.delete(`session:${token}`);
      
      return new Response(JSON.stringify({ 
        success: false, 
        message: '会话已过期' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 会话有效，可以选择延长会话
    const expiresIn = 24 * 60 * 60 * 1000; // 24小时
    session.expires = Date.now() + expiresIn;
    
    // 更新会话
    await context.env.SESSIONS.put(
      `session:${token}`, 
      JSON.stringify(session), 
      { expirationTtl: Math.floor(expiresIn / 1000) }
    );
    
    // 返回会话验证成功
    return new Response(JSON.stringify({ 
      success: true, 
      user: session.username
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('验证错误:', error);
    return new Response(JSON.stringify({ 
      success: false,
      message: '服务器错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
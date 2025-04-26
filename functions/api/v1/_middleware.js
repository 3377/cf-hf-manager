// 认证中间件
export async function onRequest(context) {
  // 获取请求路径
  const url = new URL(context.request.url);
  const path = url.pathname;
  
  // 登录和验证路径不需要认证
  if (path.endsWith('/login') || path.endsWith('/verify') || path.endsWith('/verifyToken') || context.request.method === 'OPTIONS') {
    return await context.next();
  }
  
  try {
    // 从请求头获取令牌
    const authHeader = context.request.headers.get('Authorization');
    
    // 如果没有提供令牌，返回401
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: '未授权访问' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 提取令牌
    const token = authHeader.split(' ')[1];
    
    // 从KV获取会话
    const sessionData = await context.env.SESSIONS.get(`session:${token}`);
    
    // 如果没有找到会话或会话已过期
    if (!sessionData) {
      return new Response(JSON.stringify({ error: '会话已过期或无效' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解析会话数据
    const session = JSON.parse(sessionData);
    
    // 检查会话是否过期
    if (session.expires < Date.now()) {
      // 删除过期会话
      await context.env.SESSIONS.delete(`session:${token}`);
      
      return new Response(JSON.stringify({ error: '会话已过期' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 添加会话信息到上下文中，供后续处理程序使用
    context.session = session;
    context.sessionId = token;
    
    // 继续处理请求
    return await context.next();
  } catch (error) {
    console.error('中间件错误:', error);
    return new Response(JSON.stringify({ error: '服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
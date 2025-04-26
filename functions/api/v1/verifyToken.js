// 验证用户令牌的API端点
export async function onRequest(context) {
  try {
    // 从请求头中获取授权令牌
    const authHeader = context.request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '未提供有效的授权令牌' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // 从KV存储中获取会话
    const sessionData = await context.env.SESSIONS.get(`session:${token}`);
    
    if (!sessionData) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '会话不存在或已过期' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解析会话数据
    const session = JSON.parse(sessionData);
    
    // 检查会话是否过期
    if (session.expires < Date.now()) {
      // 删除过期的会话
      await context.env.SESSIONS.delete(`session:${token}`);
      
      return new Response(JSON.stringify({ 
        success: false, 
        message: '会话已过期' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 返回会话有效的响应
    return new Response(JSON.stringify({ 
      success: true,
      username: session.username,
      expiresAt: session.expires
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('验证令牌错误:', error);
    return new Response(JSON.stringify({ 
      success: false,
      message: '服务器错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
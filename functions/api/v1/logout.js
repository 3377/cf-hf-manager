// 处理用户登出的API端点
export async function onRequest(context) {
  // 只允许POST请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: '方法不允许' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    });
  }

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
    
    // 从KV存储中删除会话
    await context.env.SESSIONS.delete(`session:${token}`);
    
    // 返回成功响应
    return new Response(JSON.stringify({ 
      message: '登出成功',
      success: true 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('登出错误:', error);
    return new Response(JSON.stringify({ 
      message: '服务器错误',
      success: false 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
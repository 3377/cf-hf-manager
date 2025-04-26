// 外部API中间件
// 用于验证外部API请求的API_KEY
export async function onRequest(context) {
  try {
    // 获取Authorization请求头
    const authHeader = context.request.headers.get('Authorization');
    
    // 检查Authorization头是否存在且格式正确
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        success: false,
        message: '未提供有效的Authorization头，应为Bearer格式' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 从请求头中提取令牌
    const providedApiKey = authHeader.split(' ')[1];
    
    // 从环境变量获取配置的API_KEY
    const configuredApiKey = context.env.API_KEY;
    
    // 如果环境变量中未配置API_KEY
    if (!configuredApiKey) {
      return new Response(JSON.stringify({ 
        success: false,
        message: '系统未配置外部API访问功能，请联系管理员配置API_KEY环境变量' 
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证API_KEY是否匹配
    if (providedApiKey !== configuredApiKey) {
      return new Response(JSON.stringify({ 
        success: false,
        message: '无效的API密钥' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // API_KEY验证通过，继续处理请求
    return await context.next();
  } catch (error) {
    console.error('外部API中间件错误:', error);
    return new Response(JSON.stringify({ 
      success: false,
      message: '服务器错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
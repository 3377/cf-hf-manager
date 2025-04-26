// 全局中间件
export async function onRequest(context) {
  try {
    // 获取请求的URL
    const url = new URL(context.request.url);
    
    // 设置CORS响应头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400' // 24小时
    };
    
    // 处理CORS预检请求
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // 继续执行请求
    const response = await context.next();
    
    // 添加CORS响应头到所有响应
    const newResponse = new Response(response.body, response);
    
    Object.keys(corsHeaders).forEach(key => {
      newResponse.headers.set(key, corsHeaders[key]);
    });
    
    return newResponse;
  } catch (error) {
    console.error('全局中间件错误:', error);
    
    return new Response(JSON.stringify({
      error: '服务器错误'
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
} 
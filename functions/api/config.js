// 配置信息API
export async function onRequest(context) {
  try {
    // 从环境变量获取配置信息
    const usernames = context.env.HF_USERNAMES || 'admin'; // 默认值
    const version = context.env.APP_VERSION || '1.0.0';
    
    // 返回配置信息
    return new Response(JSON.stringify({
      usernames: usernames,
      version: version
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取配置信息错误:', error);
    return new Response(JSON.stringify({
      error: '服务器错误'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
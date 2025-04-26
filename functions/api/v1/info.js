// 提供系统信息的API
export async function onRequest(context) {
  try {
    return new Response(JSON.stringify({
      success: true,
      version: context.env.APP_VERSION || '1.0.0',
      name: 'HF Space Manager',
      environment: 'cloudflare-pages',
      apiVersion: 'v1'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取系统信息错误:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '服务器错误'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
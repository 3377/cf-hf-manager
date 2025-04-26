// 使用环境变量存储用户名和密码
// 必须在Cloudflare Pages的环境变量中设置USERNAME和PASSWORD
export async function onRequest(context) {
  // 只允许POST请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '方法不允许' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    });
  }

  try {
    // 解析请求体
    const body = await context.request.json();
    const { username, password } = body;

    // 验证是否提供了用户名和密码
    if (!username || !password) {
      return new Response(JSON.stringify({ 
        success: false,
        message: '用户名和密码必须提供' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 验证用户凭据 (从环境变量中获取)
    const validUsername = context.env.HF_USERNAME || 'admin';
    const validPassword = context.env.HF_PASSWORD || 'password';

    if (username !== validUsername || password !== validPassword) {
      return new Response(JSON.stringify({ 
        success: false,
        message: '用户名或密码错误' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 生成随机令牌
    const token = crypto.randomUUID();
    
    // 设置会话过期时间
    const expiresIn = 24 * 60 * 60 * 1000; // 24小时
    const expires = Date.now() + expiresIn;

    // 创建会话对象
    const session = {
      username,
      expires,
      created: Date.now()
    };

    // 将会话存储在KV
    await context.env.SESSIONS.put(
      `session:${token}`, 
      JSON.stringify(session), 
      { expirationTtl: Math.floor(expiresIn / 1000) }
    );

    // 返回令牌和过期时间
    return new Response(JSON.stringify({
      success: true,
      token,
      expires,
      user: username
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('登录错误:', error);
    return new Response(JSON.stringify({ 
      success: false,
      message: '服务器错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
// 重启Space的API
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
    
    // 获取Space ID
    const url = new URL(context.request.url);
    const pathParts = url.pathname.split('/');
    const spaceId = pathParts[pathParts.length - 1];
    
    if (!spaceId) {
      return new Response(JSON.stringify({
        error: '缺少Space ID'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取Space信息，确定其所属用户
    let spaceInfo;
    try {
      // 从spaces API获取空间信息
      const spacesResponse = await fetch(new URL('/api/proxy/spaces', url.origin).toString(), {
        headers: {
          'Cookie': context.request.headers.get('Cookie') || ''
        }
      });
      
      if (!spacesResponse.ok) {
        throw new Error(`获取Spaces列表失败: ${spacesResponse.status}`);
      }
      
      const spaces = await spacesResponse.json();
      spaceInfo = spaces.find(space => space.repo_id === spaceId);
      
      if (!spaceInfo) {
        return new Response(JSON.stringify({
          error: `找不到Space: ${spaceId}`
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('获取Space信息错误:', error);
      return new Response(JSON.stringify({
        error: '获取Space信息失败: ' + error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取适合的API令牌
    let apiToken;
    
    // 尝试从用户-令牌映射中获取特定用户的令牌
    const hfUserConfig = context.env.HF_USER || '';
    if (hfUserConfig && spaceInfo.username) {
      const userTokenMapping = {};
      hfUserConfig.split(',').forEach(pair => {
        const parts = pair.split(':').map(part => part.trim());
        const username = parts[0];
        const token = parts[1] || '';
        if (username && token) {
          userTokenMapping[username] = token;
        }
      });
      
      // 如果存在该用户的特定令牌，则使用它
      if (userTokenMapping[spaceInfo.username]) {
        apiToken = userTokenMapping[spaceInfo.username];
      }
    }
    
    // 如果没有找到特定用户的令牌，则使用全局令牌
    if (!apiToken) {
      apiToken = context.env.HF_API_TOKEN;
    }
    
    // 检查是否有可用的令牌
    if (!apiToken) {
      return new Response(JSON.stringify({
        error: `无法操作用户 ${spaceInfo.username} 的Space：未配置API令牌`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 调用Hugging Face API重启Space
    console.log(`开始重启Space: ${spaceId}，使用API: https://huggingface.co/api/spaces/${spaceId}/restart`);
    
    const response = await fetch(`https://huggingface.co/api/spaces/${spaceId}/restart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      // 添加空的请求体，确保请求格式正确
      body: JSON.stringify({}),
      // 设置超时，防止长时间等待
      signal: AbortSignal.timeout(30000) // 30秒超时
    });
    
    // 记录响应状态码
    console.log(`Space重启请求响应状态: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`重启Space失败 (${spaceId}): 状态码 ${response.status}, 响应: ${error}`);
      throw new Error(`重启Space失败: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    console.log(`Space重启请求成功发送 (${spaceId}), 响应:`, result);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Space重启请求已发送',
      data: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    // 增强错误日志
    console.error('重启Space错误:', error);
    
    // 检查是否是超时错误
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return new Response(JSON.stringify({
        error: '重启Space请求超时，请稍后重试'
      }), {
        status: 504, // Gateway Timeout
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      error: '重启Space失败: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
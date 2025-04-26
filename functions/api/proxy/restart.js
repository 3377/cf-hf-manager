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
    console.log(`开始重启Space: ${spaceId}，使用标准API: https://huggingface.co/api/spaces/${spaceId}/restart`);
    
    try {
      // 构建API调用的请求头
      const apiHeaders = {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'HF-Space-Manager/2.0 (Compatible; Hugging Face API Client)',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://huggingface.co',
        'Referer': `https://huggingface.co/spaces/${spaceId}`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };
      
      // 使用内置的 fetch 方法，添加必要的头部
      const response = await fetch(`https://huggingface.co/api/spaces/${spaceId}/restart`, {
        method: 'POST',
        headers: apiHeaders,
        // 确保请求体有效，即使是空对象
        body: JSON.stringify({}),
        // 设置超时保护
        signal: AbortSignal.timeout(30000) // 30秒超时
      });
      
      // 记录响应状态码以进行调试
      console.log(`Space重启请求响应状态: ${response.status}`);
      
      // 如果响应不成功，抛出错误
      if (!response.ok) {
        const error = await response.text();
        console.error(`重启Space失败 (${spaceId}): 状态码 ${response.status}, 响应: ${error}`);
        throw new Error(`重启Space失败: ${response.status} - ${error}`);
      }
      
      // 解析结果
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        console.warn(`无法解析JSON响应: ${jsonError.message}, 原始响应: ${await response.text()}`);
        // 如果响应成功但非JSON，则创建默认响应
        result = { status: 'success', message: '操作成功，但服务器未返回详细信息' };
      }
      
      console.log(`Space重启请求成功发送 (${spaceId}), 响应:`, result);
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Space重启请求已发送',
        data: result
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (fetchError) {
      console.error(`重启Space API请求失败 (${spaceId}):`, fetchError);
      throw fetchError; // 重新抛出，让外层捕获
    }
    
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
    
    // 创建更友好的错误消息
    let statusCode = 500;
    let errorMessage = error.message;
    
    // 处理特定API错误
    if (errorMessage.includes('405')) {
      statusCode = 405;
      errorMessage = 'HuggingFace API不允许此操作方法，可能需要特定权限或API已变更';
    } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
      statusCode = 403;
      errorMessage = '权限不足或Token无效，无法对此Space执行操作';
    } else if (errorMessage.includes('404')) {
      statusCode = 404;
      errorMessage = '找不到指定的Space，请确认ID是否正确';
    }
    
    return new Response(JSON.stringify({
      error: '重启Space失败: ' + errorMessage
    }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
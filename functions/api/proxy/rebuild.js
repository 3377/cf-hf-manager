// 重建Space的API
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
    
    // 调用Hugging Face API重建Space
    console.log(`开始重建Space: ${spaceId}，尝试多种可能的API端点`);
    
    // 按优先级尝试多个端点，直到成功
    const apiEndpoints = [
      { url: `https://huggingface.co/api/spaces/${spaceId}/factory-reboot`, desc: "factory-reboot" },
      { url: `https://huggingface.co/api/spaces/${spaceId}/restart?factory=true`, desc: "restart?factory=true" },
      { url: `https://huggingface.co/api/spaces/${spaceId}/build`, desc: "build" }
    ];
    
    let lastError = null;
    let successResponse = null;
    
    // 依次尝试每个API端点
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`尝试使用API端点: ${endpoint.desc}`);
        
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'HF-Space-Manager/2.0'
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(30000) // 30秒超时
        });
        
        console.log(`${endpoint.desc} 响应状态: ${response.status}`);
        
        if (response.ok) {
          // 找到成功的端点
          let result;
          try {
            result = await response.json();
          } catch (jsonError) {
            console.warn(`无法解析JSON响应: ${jsonError.message}`);
            result = { status: 'success', message: '操作成功，但服务器未返回详细信息' };
          }
          
          console.log(`使用 ${endpoint.desc} 重建请求成功`);
          successResponse = {
            success: true,
            message: `Space重建请求已通过 ${endpoint.desc} 发送`,
            data: result
          };
          break; // 成功后跳出循环
        } else {
          const error = await response.text();
          console.error(`${endpoint.desc} 失败: 状态码 ${response.status}, 响应: ${error}`);
          lastError = new Error(`${endpoint.desc} 失败: ${response.status} - ${error}`);
        }
      } catch (fetchError) {
        console.error(`${endpoint.desc} 请求错误:`, fetchError);
        lastError = fetchError;
      }
    }
    
    // 如果有成功的响应，返回它
    if (successResponse) {
      return new Response(JSON.stringify(successResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 如果所有尝试都失败，抛出最后一个错误
    if (lastError) {
      throw lastError;
    } else {
      throw new Error('所有API端点均请求失败');
    }
    
  } catch (error) {
    // 增强错误日志
    console.error('重建Space错误:', error);
    
    // 检查是否是超时错误
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return new Response(JSON.stringify({
        error: '重建Space请求超时，请稍后重试'
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
      error: '重建Space失败: ' + errorMessage
    }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
// 执行操作的API
export async function onRequest(context) {
  // 验证是否已通过认证
  if (!context.session) {
    return new Response(JSON.stringify({
      success: false,
      message: '未授权操作'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // 解析请求体
    const body = await context.request.json();
    const { action, spaceId } = body;
    
    if (!action || !spaceId) {
      return new Response(JSON.stringify({
        success: false,
        message: '缺少必要参数：action和spaceId'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取Space信息，确定其所属用户
    let spaceInfo;
    try {
      // 从spaces API获取空间信息
      const url = new URL(context.request.url);
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
          success: false,
          message: `找不到Space: ${spaceId}`
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('获取Space信息错误:', error);
      return new Response(JSON.stringify({
        success: false,
        message: '获取Space信息失败: ' + error.message
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
        success: false,
        message: `无法操作用户 ${spaceInfo.username} 的Space：未配置API令牌`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let endpoint;
    let method = 'POST';
    
    // 根据操作类型选择端点
    switch (action) {
      case 'restart':
        endpoint = `https://huggingface.co/api/spaces/${spaceId}/restart`;
        break;
      case 'rebuild':
        endpoint = `https://huggingface.co/api/spaces/${spaceId}/factory-reboot`;
        break;
      case 'pause':
        endpoint = `https://huggingface.co/api/spaces/${spaceId}/pause`;
        break;
      case 'resume':
        endpoint = `https://huggingface.co/api/spaces/${spaceId}/resume`;
        break;
      default:
        return new Response(JSON.stringify({
          success: false,
          message: `不支持的操作: ${action}`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // 调用Hugging Face API
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`操作失败: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      message: `操作 ${action} 已发送到 ${spaceId}`,
      data: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('执行操作错误:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '执行操作失败: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
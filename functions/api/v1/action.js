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
    
    // 从环境变量获取HF API令牌
    const apiToken = context.env.HF_API_TOKEN;
    
    if (!apiToken) {
      return new Response(JSON.stringify({
        success: false,
        message: 'API令牌未配置'
      }), {
        status: 500,
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
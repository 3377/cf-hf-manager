import { getConfig } from '../../../../config';
import { getSpaces } from '../../../../helpers';

export async function onRequestPost(context) {
  try {
    // 获取系统配置
    const config = await getConfig(context.env);
    
    // 从URL中获取Space ID
    const { spaceId } = context.params;
    
    if (!spaceId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Space ID参数缺失'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取所有spaces
    const allSpaces = await getSpaces(context.env, config);
    
    // 查找指定ID的space
    const space = allSpaces.find(space => space.id === spaceId);
    
    // 如果没有找到该space
    if (!space) {
      return new Response(JSON.stringify({
        success: false,
        message: `未找到ID为 ${spaceId} 的space`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取适合的API令牌
    let apiToken;
    
    // 尝试从用户-令牌映射中获取特定用户的令牌
    const hfUserConfig = context.env.HF_USER || '';
    if (hfUserConfig && space.username) {
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
      if (userTokenMapping[space.username]) {
        apiToken = userTokenMapping[space.username];
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
        message: `无法操作用户 ${space.username} 的Space：未配置API令牌`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 调用Hugging Face API重建Space
    const response = await fetch(`https://huggingface.co/api/spaces/${spaceId}/factory-reboot`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`重建Space失败: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      message: `Space ${spaceId} 重建请求已发送`,
      data: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('外部API重建Space错误:', error);
    return new Response(JSON.stringify({
      success: false,
      message: `重建Space失败: ${error.message}`
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
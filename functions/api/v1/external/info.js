import { getConfig } from '../../config';

export async function onRequestGet(context) {
  try {
    // 获取系统配置
    const config = await getConfig(context.env);
    
    // 过滤敏感信息，不返回token
    const sanitizedConfig = {
      ...config,
      tokens: undefined, // 不返回token信息
      usernames: config.usernames || [], // 返回可用用户列表
    };
    
    // 构建API信息响应
    const apiInfo = {
      success: true,
      version: '1.0',
      service: 'HF Spaces Manager',
      config: sanitizedConfig,
      endpoints: [
        {
          path: '/api/v1/external/info',
          method: 'GET',
          description: '获取系统信息'
        },
        {
          path: '/api/v1/external/spaces',
          method: 'GET',
          description: '获取所有可用的Spaces列表'
        },
        {
          path: '/api/v1/external/spaces/:username',
          method: 'GET',
          description: '获取特定用户的Spaces列表'
        },
        {
          path: '/api/v1/external/action/:spaceId/restart',
          method: 'POST',
          description: '重启指定的Space'
        },
        {
          path: '/api/v1/external/action/:spaceId/rebuild',
          method: 'POST',
          description: '重建指定的Space'
        },
        {
          path: '/api/v1/external/action/:spaceId/pause',
          method: 'POST',
          description: '暂停指定的Space'
        },
        {
          path: '/api/v1/external/action/:spaceId/resume',
          method: 'POST',
          description: '恢复指定的Space'
        }
      ]
    };
    
    return new Response(JSON.stringify(apiInfo), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('外部API info端点错误:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '获取系统信息失败',
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
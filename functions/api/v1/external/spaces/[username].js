import { getConfig, getSpaces } from '../../../../helpers';

export async function onRequestGet(context) {
  try {
    // 获取系统配置
    const config = await getConfig(context.env);
    
    // 从URL中获取用户名
    const { username } = context.params;
    
    if (!username) {
      return new Response(JSON.stringify({
        success: false,
        message: '用户名参数缺失'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取所有spaces
    const allSpaces = await getSpaces(context.env, config);
    
    // 过滤出指定用户的spaces
    const userSpaces = allSpaces.filter(space => space.username === username);
    
    // 如果没有找到该用户的spaces
    if (userSpaces.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        count: 0,
        spaces: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 过滤掉敏感数据，只返回必要的信息
    const sanitizedSpaces = userSpaces.map(space => ({
      id: space.id,
      name: space.name,
      username: space.username,
      status: space.status,
      hardware: space.hardware,
      sdkVersion: space.sdkVersion,
      url: space.url,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt
    }));
    
    return new Response(JSON.stringify({
      success: true,
      count: sanitizedSpaces.length,
      spaces: sanitizedSpaces
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(`获取用户 ${context.params.username} 的spaces列表错误:`, error);
    return new Response(JSON.stringify({
      success: false,
      message: `获取用户 ${context.params.username} 的spaces列表失败`,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
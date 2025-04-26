import { getConfig, getSpaces } from '../../../helpers';

export async function onRequestGet(context) {
  try {
    // 获取系统配置
    const config = await getConfig(context.env);
    
    // 获取所有spaces
    const spaces = await getSpaces(context.env, config);
    
    // 过滤掉敏感数据，只返回必要的信息
    const sanitizedSpaces = spaces.map(space => ({
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
    console.error('获取spaces列表错误:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '获取spaces列表失败',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
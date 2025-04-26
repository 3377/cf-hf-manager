import { getConfig, getSpaces } from '../../../../helpers';

export async function onRequestGet(context) {
  try {
    // 获取系统配置
    const config = await getConfig(context.env);
    
    // 从URL中获取space ID
    const { id } = context.params;
    
    if (!id) {
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
    const space = allSpaces.find(space => space.id === id);
    
    // 如果没有找到该space
    if (!space) {
      return new Response(JSON.stringify({
        success: false,
        message: `未找到ID为 ${id} 的space`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 过滤掉敏感数据，只返回必要的信息
    const sanitizedSpace = {
      id: space.id,
      name: space.name,
      username: space.username,
      status: space.status,
      hardware: space.hardware,
      sdkVersion: space.sdkVersion,
      url: space.url,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      description: space.description || '',
      lastSeen: space.lastSeen || null,
      tags: space.tags || [],
      likes: space.likes || 0,
      visibility: space.visibility || 'public'
    };
    
    return new Response(JSON.stringify({
      success: true,
      space: sanitizedSpace
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(`获取space ID ${context.params.id} 的详细信息错误:`, error);
    return new Response(JSON.stringify({
      success: false,
      message: `获取space详细信息失败`,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
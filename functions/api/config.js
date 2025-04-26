// 配置信息API
export async function onRequest(context) {
  try {
    const config = await getConfig(context.env);
    
    // 返回配置信息
    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取配置信息错误:', error);
    return new Response(JSON.stringify({
      error: '服务器错误'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 获取系统配置
 * 
 * @param {Object} env - 环境变量对象
 * @returns {Promise<Object>} - 配置对象
 */
export async function getConfig(env) {
  // 从环境变量获取配置信息
  let usernames = '';
  
  // 尝试从HF_USER环境变量提取用户名
  const hfUserConfig = env.HF_USER || '';
  if (hfUserConfig) {
    const usernamesFromMapping = hfUserConfig.split(',')
      .map(pair => pair.split(':')[0].trim())
      .filter(Boolean);
    
    if (usernamesFromMapping.length > 0) {
      usernames = usernamesFromMapping.join(',');
    }
  }
  
  // 如果HF_USER未设置或没有提取到用户名，则使用HF_USERNAMES
  if (!usernames) {
    usernames = env.HF_USERNAMES || 'admin'; // 默认值
  }
  
  const version = env.APP_VERSION || '1.0.0';
  
  // 返回配置对象
  return {
    usernames: usernames,
    version: version
  };
} 
// 测试配置API - 用于检查环境变量和配置是否正常
export async function onRequest(context) {
  console.log('========== API /test-config 请求开始 ==========');
  try {
    // 获取环境变量名称（不包括值，以保护隐私）
    const envVars = Object.keys(context.env || {}).reduce((acc, key) => {
      // 对于敏感变量，只显示是否存在，不显示具体值
      if (key.includes('TOKEN') || key.includes('PASSWORD') || key.includes('KEY') || key.includes('USER')) {
        acc[key] = '***已设置***';
      } else {
        acc[key] = context.env[key];
      }
      return acc;
    }, {});
    
    // 检查并提取HF_USER格式信息
    const hfUserConfig = context.env.HF_USER || '';
    const userFormat = {
      exists: !!hfUserConfig,
      hasCorrectFormat: hfUserConfig.includes(':'),
      userCount: hfUserConfig ? hfUserConfig.split(',').length : 0,
      // 提取用户名但不提取令牌
      usernames: hfUserConfig ? 
        hfUserConfig.split(',')
          .map(pair => pair.split(':')[0].trim())
          .filter(Boolean) : 
        []
    };
    
    // 检查其他关键配置
    const configStatus = {
      HF_API_TOKEN_exists: !!context.env.HF_API_TOKEN,
      HF_USERNAME_exists: !!context.env.HF_USERNAME,
      HF_PASSWORD_exists: !!context.env.HF_PASSWORD,
      HF_USERNAMES_exists: !!context.env.HF_USERNAMES,
      // 提取HF_USERNAMES的用户名列表
      HF_USERNAMES_list: context.env.HF_USERNAMES ? 
        context.env.HF_USERNAMES.split(',').map(u => u.trim()).filter(Boolean) : 
        []
    };
    
    // 测试HF API连接状态
    let apiStatus = "未测试";
    try {
      // 尝试无令牌请求（公开API）
      const response = await fetch('https://huggingface.co/api/users/about', { 
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      apiStatus = {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      };
    } catch (apiError) {
      apiStatus = {
        error: apiError.message
      };
    }
    
    // 返回配置信息
    const result = {
      timestamp: new Date().toISOString(),
      environmentVariables: envVars,
      hfUserFormat: userFormat,
      configStatus: configStatus,
      huggingfaceApiStatus: apiStatus,
      message: "此接口用于测试环境配置，不会显示任何敏感信息"
    };
    
    console.log('测试配置结果:', JSON.stringify(result, null, 2));
    console.log('========== API /test-config 请求完成 ==========');
    
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    console.error('测试配置API错误:', error);
    console.log('========== API /test-config 请求异常结束 ==========');
    
    return new Response(JSON.stringify({
      error: '测试配置失败: ' + error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
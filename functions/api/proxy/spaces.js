// 获取Spaces列表的API
export async function onRequest(context) {
  console.log('========== API /proxy/spaces 请求开始 ==========');
  try {
    // 记录所有可用的环境变量（仅记录名称，不记录值，防止泄露敏感信息）
    const envVarNames = Object.keys(context.env || {});
    console.log('可用环境变量名称:', envVarNames);
    
    // 解析用户-令牌映射
    const userTokenMapping = {};
    const usernames = [];
    const hfUserConfig = context.env.HF_USER || '';
    
    console.log('HF_USER配置是否存在:', !!hfUserConfig);
    if (hfUserConfig) {
      // 不记录完整配置，但记录是否符合预期格式
      const hasCorrectFormat = hfUserConfig.includes(':');
      console.log('HF_USER格式是否正确 (包含":"):', hasCorrectFormat);
      
      hfUserConfig.split(',').forEach(pair => {
        const parts = pair.split(':').map(part => part.trim());
        const username = parts[0];
        const token = parts[1] || '';
        if (username) {
          usernames.push(username);
          if (token) {
            userTokenMapping[username] = token;
          }
        }
      });
    }
    
    console.log('解析后的用户名列表:', usernames);
    console.log('用户Token映射个数:', Object.keys(userTokenMapping).length);
    
    // 全局API令牌（当没有特定用户令牌时使用）
    const globalApiToken = context.env.HF_API_TOKEN;
    console.log('HF_API_TOKEN是否配置:', !!globalApiToken);
    
    // 如果未配置任何令牌，则返回错误
    if (Object.keys(userTokenMapping).length === 0 && !globalApiToken) {
      console.log('错误: 未配置任何API令牌');
      return new Response(JSON.stringify({
        error: 'API令牌未配置，请设置HF_USER或HF_API_TOKEN环境变量'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取所有Spaces
    let allSpaces = [];
    
    // 如果配置了用户-令牌映射，则获取每个用户的Spaces
    if (Object.keys(userTokenMapping).length > 0) {
      console.log('使用用户-令牌映射获取Spaces');
      
      // 并行获取所有用户的Spaces
      const spacesFetchPromises = Object.entries(userTokenMapping).map(
        ([username, token]) => fetchUserSpaces(username, token)
      );
      
      const results = await Promise.allSettled(spacesFetchPromises);
      
      let successCount = 0;
      let failureCount = 0;
      
      // 合并所有成功获取的Spaces
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          allSpaces = allSpaces.concat(result.value);
          successCount++;
        } else {
          const username = Object.keys(userTokenMapping)[index];
          console.error(`获取用户 ${username} 的Spaces失败:`, result.reason);
          failureCount++;
        }
      });
      
      console.log(`用户Spaces获取结果: 成功=${successCount}, 失败=${failureCount}`);
    }
    
    // 如果没有使用用户-令牌映射获取到Spaces，但配置了全局令牌，则使用全局令牌获取
    if (allSpaces.length === 0 && globalApiToken) {
      console.log('使用全局令牌获取Spaces');
      try {
        const spaces = await fetchSpacesWithToken(globalApiToken);
        if (spaces) {
          allSpaces = spaces;
          console.log('使用全局令牌成功获取Spaces');
        }
      } catch (error) {
        console.error('使用全局令牌获取Spaces失败:', error);
      }
    }
    
    console.log('获取到的Spaces数量:', allSpaces.length);
    
    // 显示获取到的前3个Space的ID和名称（如果有）
    if (allSpaces.length > 0) {
      const sampleSpaces = allSpaces.slice(0, 3).map(space => ({
        id: space.id,
        name: space.name,
        username: space.username
      }));
      console.log('样本Space数据:', JSON.stringify(sampleSpaces));
    }
    
    // 如果指定了过滤用户名，则过滤结果
    let filterUsernames;
    
    // 如果设置了HF_USERNAMES环境变量，使用它进行过滤
    if (context.env.HF_USERNAMES) {
      filterUsernames = context.env.HF_USERNAMES.split(',').map(u => u.trim()).filter(Boolean);
      console.log('从HF_USERNAMES获取过滤用户名:', filterUsernames);
    } 
    // 否则，如果设置了HF_USER，使用从中提取的用户名
    else if (usernames.length > 0) {
      filterUsernames = usernames;
      console.log('从HF_USER获取过滤用户名:', filterUsernames);
    }
    
    // 应用过滤
    let filteredSpaces = allSpaces;
    if (filterUsernames && filterUsernames.length > 0) {
      console.log('过滤前Spaces数量:', filteredSpaces.length);
      filteredSpaces = allSpaces.filter(space => filterUsernames.includes(space.username));
      console.log('过滤后Spaces数量:', filteredSpaces.length);
    }
    
    // 添加字段映射，确保前端需要的字段存在
    const mappedSpaces = filteredSpaces.map(space => {
      // 记录映射前后的字段名（仅对第一个项目）
      if (space === filteredSpaces[0]) {
        console.log('映射前的字段:', Object.keys(space));
      }
      
      // 确保必要字段存在
      return {
        ...space,
        // 前端使用repo_id，但API返回的是id
        repo_id: space.repo_id || space.id || '',
        // 前端使用last_modified，但API可能返回的是updatedAt或其他
        last_modified: space.last_modified || space.updatedAt || space.updated_at || new Date().toISOString()
      };
    });
    
    if (mappedSpaces.length > 0) {
      console.log('映射后的字段:', Object.keys(mappedSpaces[0]));
      // 打印第一个项目的完整数据（帮助调试）
      console.log('第一个Space的完整数据:', JSON.stringify(mappedSpaces[0]));
    } else {
      console.log('警告: 映射后的数据为空');
    }
    
    console.log('========== API /proxy/spaces 请求完成 ==========');
    
    return new Response(JSON.stringify(mappedSpaces), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    console.error('获取Spaces列表错误:', error);
    console.log('========== API /proxy/spaces 请求异常结束 ==========');
    return new Response(JSON.stringify({
      error: '获取Spaces列表失败: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 使用给定令牌获取Spaces列表
async function fetchSpacesWithToken(token) {
  try {
    console.log('开始获取Spaces列表，使用令牌...');
    
    // 构建请求
    const url = 'https://huggingface.co/api/spaces';
    console.log('请求URL:', url);
    
    const headers = {
      'Authorization': `Bearer ${token.slice(0, 3)}...${token.slice(-3)}` // 记录令牌的一部分用于调试，保护隐私
    };
    console.log('发送请求，使用令牌前3位和后3位:', headers.Authorization);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('API响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      console.error(`获取Spaces列表失败，状态码: ${response.status}`);
      throw new Error(`获取Spaces列表失败: ${response.status}`);
    }
    
    // 获取响应文本
    const responseText = await response.text();
    console.log('API响应长度:', responseText.length, '字节');
    
    // 尝试解析响应
    let data;
    try {
      data = JSON.parse(responseText);
      console.log(`成功解析API响应，获取到 ${data.length} 个Spaces对象`);
    } catch (parseError) {
      console.error('解析API响应失败:', parseError);
      console.log('原始响应内容 (前200字符):', responseText.substring(0, 200));
      throw new Error('解析HF API响应失败: ' + parseError.message);
    }
    
    return data;
  } catch (error) {
    console.error('获取Spaces列表时发生错误:', error);
    throw error;
  }
}

// 获取指定用户的Spaces
async function fetchUserSpaces(username, token) {
  try {
    console.log(`开始获取用户 ${username} 的Spaces...`);
    
    const spaces = await fetchSpacesWithToken(token);
    // 只返回属于指定用户的Spaces
    const userSpaces = spaces.filter(space => space.username === username);
    
    console.log(`用户 ${username} 有 ${userSpaces.length} 个Spaces`);
    
    // 如果用户有Spaces，记录第一个Space的ID供参考
    if (userSpaces.length > 0) {
      console.log(`用户 ${username} 的第一个Space ID:`, userSpaces[0].id);
    }
    
    return userSpaces;
  } catch (error) {
    console.error(`获取用户 ${username} 的Spaces失败:`, error);
    return null;
  }
} 
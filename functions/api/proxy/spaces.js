// 获取Spaces列表的API
export async function onRequest(context) {
  try {
    // 解析用户-令牌映射
    const userTokenMapping = {};
    const usernames = [];
    const hfUserConfig = context.env.HF_USER || '';
    
    if (hfUserConfig) {
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
    
    // 全局API令牌（当没有特定用户令牌时使用）
    const globalApiToken = context.env.HF_API_TOKEN;
    
    // 如果未配置任何令牌，则返回错误
    if (Object.keys(userTokenMapping).length === 0 && !globalApiToken) {
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
      // 并行获取所有用户的Spaces
      const spacesFetchPromises = Object.entries(userTokenMapping).map(
        ([username, token]) => fetchUserSpaces(username, token)
      );
      
      const results = await Promise.allSettled(spacesFetchPromises);
      
      // 合并所有成功获取的Spaces
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          allSpaces = allSpaces.concat(result.value);
        } else {
          const username = Object.keys(userTokenMapping)[index];
          console.error(`获取用户 ${username} 的Spaces失败:`, result.reason);
        }
      });
    }
    
    // 如果没有使用用户-令牌映射获取到Spaces，但配置了全局令牌，则使用全局令牌获取
    if (allSpaces.length === 0 && globalApiToken) {
      try {
        const spaces = await fetchSpacesWithToken(globalApiToken);
        if (spaces) {
          allSpaces = spaces;
        }
      } catch (error) {
        console.error('使用全局令牌获取Spaces失败:', error);
      }
    }
    
    // 如果指定了过滤用户名，则过滤结果
    let filterUsernames;
    
    // 如果设置了HF_USERNAMES环境变量，使用它进行过滤
    if (context.env.HF_USERNAMES) {
      filterUsernames = context.env.HF_USERNAMES.split(',').map(u => u.trim()).filter(Boolean);
    } 
    // 否则，如果设置了HF_USER，使用从中提取的用户名
    else if (usernames.length > 0) {
      filterUsernames = usernames;
    }
    
    // 应用过滤
    let filteredSpaces = allSpaces;
    if (filterUsernames && filterUsernames.length > 0) {
      filteredSpaces = allSpaces.filter(space => filterUsernames.includes(space.username));
    }
    
    return new Response(JSON.stringify(filteredSpaces), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取Spaces列表错误:', error);
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
  const response = await fetch('https://huggingface.co/api/spaces', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`获取Spaces列表失败: ${response.status}`);
  }
  
  return await response.json();
}

// 获取指定用户的Spaces
async function fetchUserSpaces(username, token) {
  try {
    const spaces = await fetchSpacesWithToken(token);
    // 只返回属于指定用户的Spaces
    return spaces.filter(space => space.username === username);
  } catch (error) {
    console.error(`获取用户 ${username} 的Spaces失败:`, error);
    return null;
  }
} 
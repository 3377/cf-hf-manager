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
      // 检查格式是否正确（必须包含冒号分隔用户名和令牌）
      const hasCorrectFormat = hfUserConfig.includes(':');
      console.log('HF_USER格式是否正确 (包含":"):', hasCorrectFormat);
      
      if (!hasCorrectFormat) {
        console.error('HF_USER格式错误: 必须使用 "username:token" 格式');
        return new Response(JSON.stringify({
          error: 'HF_USER格式错误，请使用 "username:token" 格式。例如："username1:token1,username2:token2"'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 拆分并解析用户-令牌对
      const pairs = hfUserConfig.split(',');
      console.log(`HF_USER包含 ${pairs.length} 个用户配置`);
      
      pairs.forEach((pair, index) => {
        const parts = pair.split(':').map(part => part.trim());
        const username = parts[0];
        const token = parts[1] || '';
        
        if (!username) {
          console.warn(`第 ${index + 1} 个配置缺少用户名`);
        } else if (!token) {
          console.warn(`用户 "${username}" 缺少令牌`);
        }
        
        if (username) {
          usernames.push(username);
          if (token) {
            userTokenMapping[username] = token;
            console.log(`成功配置用户 "${username}" 的令牌`);
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
        error: 'API令牌未配置，请设置HF_USER或HF_API_TOKEN环境变量。HF_USER应使用 "username:token" 格式。'
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
        // 如果配置了HF_USERNAME，则使用它作为author参数
        const globalUsername = context.env.HF_USERNAME || '';
        if (globalUsername) {
          console.log(`使用全局令牌和用户名 ${globalUsername} 获取Spaces`);
          // 使用fetchUserSpaces，它会自动获取每个space的详细信息
          const spaces = await fetchUserSpaces(globalUsername, globalApiToken);
          if (spaces && spaces.length > 0) {
            allSpaces = spaces;
            console.log(`使用全局令牌成功获取Spaces，总共 ${spaces.length} 个`);
          } else {
            console.warn(`使用全局令牌未获取到任何spaces，可能是配置问题或API限制`);
          }
        } else {
          console.log('警告: 使用全局令牌但未指定HF_USERNAME，将尝试获取所有公开Spaces');
          const basicSpaces = await fetchSpacesWithToken(globalApiToken, '');
          
          if (basicSpaces && basicSpaces.length > 0) {
            console.log(`获取到 ${basicSpaces.length} 个基本spaces，开始获取详细信息`);
            
            // 为每个space获取详细信息
            const enrichedSpaces = [];
            
            // 限制处理数量，避免API请求过多导致限流
            const maxSpacesToProcess = Math.min(basicSpaces.length, 50); // 最多处理50个
            console.log(`将处理前 ${maxSpacesToProcess} 个spaces的详细信息`);
            
            for (let i = 0; i < maxSpacesToProcess; i++) {
              const space = basicSpaces[i];
              try {
                if (!space.id) {
                  console.warn(`第 ${i+1} 个space缺少ID，跳过详细信息获取:`, space);
                  continue;
                }
                
                const spaceDetails = await fetchSpaceDetails(space.id, globalApiToken);
                
                if (spaceDetails) {
                  // 提取运行时信息
                  const spaceRuntime = spaceDetails.runtime || {};
                  
                  // 确定用户名
                  const spaceUsername = spaceDetails.author || '';
                  
                  // 合并基本信息和详细信息
                  const enrichedSpace = {
                    repo_id: spaceDetails.id,
                    name: spaceDetails.cardData?.title || spaceDetails.id.split('/')[1],
                    owner: spaceDetails.author,
                    username: spaceUsername,
                    url: `https://${spaceDetails.author}-${spaceDetails.id.split('/')[1]}.hf.space`,
                    status: spaceRuntime.stage || 'unknown',
                    last_modified: spaceDetails.lastModified || 'unknown',
                    created_at: spaceDetails.createdAt || 'unknown',
                    sdk: spaceDetails.sdk || 'unknown',
                    tags: spaceDetails.tags || [],
                    private: spaceDetails.private || false,
                    app_port: spaceDetails.cardData?.app_port || 'unknown'
                  };
                  
                  enrichedSpaces.push(enrichedSpace);
                } else {
                  // 使用基本信息作为后备
                  const author = space.author || (space.id ? space.id.split('/')[0] : '');
                  const fallbackSpace = {
                    repo_id: space.id,
                    name: space.title || (space.id ? space.id.split('/')[1] : ''),
                    owner: author,
                    username: author,
                    status: 'unknown',
                    url: space.id ? `https://huggingface.co/spaces/${space.id}` : '',
                    last_modified: space.lastModified || space.updatedAt || space.updated_at || new Date().toISOString()
                  };
                  
                  enrichedSpaces.push(fallbackSpace);
                }
              } catch (error) {
                console.error(`处理space ${space.id} 详细信息时出错:`, error);
              }
            }
            
            if (enrichedSpaces.length > 0) {
              allSpaces = enrichedSpaces;
              console.log(`成功获取 ${enrichedSpaces.length} 个spaces的详细信息`);
            }
          } else {
            console.warn('未获取到任何基本spaces信息');
          }
        }
      } catch (error) {
        console.error('使用全局令牌获取Spaces失败:', error);
      }
    }
    
    console.log('获取到的Spaces数量:', allSpaces.length);
    
    // 如果所有获取方法都失败，则返回错误
    if (allSpaces.length === 0) {
      console.error('无法获取任何Spaces');
      return new Response(JSON.stringify({
        error: '无法获取任何Spaces。请检查API令牌和用户名配置是否正确，以及HuggingFace API是否可访问。'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 按名称排序Spaces（与原版保持一致）
    allSpaces.sort((a, b) => {
      // 先按用户名排序
      const usernameA = a.username || '';
      const usernameB = b.username || '';
      const usernameCompare = usernameA.localeCompare(usernameB);
      
      // 如果用户名相同，则按名称排序
      if (usernameCompare === 0) {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      }
      
      return usernameCompare;
    });
    
    console.log('Spaces按名称排序完成');
    
    // 显示获取到的前3个Space的ID和名称（如果有）
    if (allSpaces.length > 0) {
      const sampleSpaces = allSpaces.slice(0, 3).map(space => ({
        id: space.repo_id,
        name: space.name,
        username: space.username,
        status: space.status
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
        last_modified: space.last_modified || space.updatedAt || space.updated_at || new Date().toISOString(),
        // 确保状态字段存在并且格式正确
        status: space.status || 'unknown'
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
async function fetchSpacesWithToken(token, username) {
  try {
    console.log(`开始获取Spaces列表，使用令牌${username ? `和用户名 ${username}` : ''}...`);
    
    // 构建请求
    let url = 'https://huggingface.co/api/spaces';
    // 如果提供了用户名，则添加author过滤参数
    if (username) {
      url = `${url}?author=${encodeURIComponent(username)}`;
    }
    console.log('请求URL:', url);
    
    const headers = {
      'Authorization': `Bearer ${token.slice(0, 3)}...${token.slice(-3)}` // 记录令牌的一部分用于调试，保护隐私
    };
    console.log('发送请求，使用令牌前3位和后3位:', headers.Authorization);
    
    // 记录完整请求信息（不含敏感值）
    console.log('请求方法:', 'GET');
    console.log('请求头部字段:', Object.keys(headers));
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    console.log('API响应状态:', response.status, response.statusText);
    console.log('API响应头部:', Object.fromEntries([...response.headers.entries()]));
    
    if (!response.ok) {
      console.error(`获取Spaces列表失败，状态码: ${response.status}`);
      
      // 根据状态码提供更有针对性的错误信息
      if (response.status === 404) {
        console.error('API返回404错误，可能是URL格式错误或资源不存在');
        // 尝试获取响应体以获取更多错误信息
        try {
          const errorText = await response.text();
          console.error('404错误响应内容:', errorText);
        } catch (e) {
          console.error('无法读取错误响应:', e);
        }
      } else if (response.status === 401) {
        console.error('API返回401错误，令牌可能无效或已过期');
      } else if (response.status === 403) {
        console.error('API返回403错误，令牌权限不足');
      } else if (response.status >= 500) {
        console.error('API返回服务器错误，HuggingFace服务可能存在问题');
      }
      
      throw new Error(`获取Spaces列表失败: ${response.status} ${response.statusText}`);
    }
    
    // 获取响应文本
    const responseText = await response.text();
    console.log('API响应长度:', responseText.length, '字节');
    
    // 如果响应为空，返回空数组
    if (!responseText.trim()) {
      console.warn('API响应为空，返回空数组');
      return [];
    }
    
    // 尝试解析响应
    let data;
    try {
      data = JSON.parse(responseText);
      
      // 验证数据是否为数组
      if (!Array.isArray(data)) {
        console.error('API响应不是数组格式:', typeof data);
        console.log('响应内容 (前200字符):', responseText.substring(0, 200));
        throw new Error('API响应格式错误，预期为数组');
      }
      
      console.log(`成功解析API响应，获取到 ${data.length} 个Spaces对象`);
      
      // 如果有数据，记录第一个item的字段
      if (data.length > 0) {
        console.log('Space对象字段:', Object.keys(data[0]));
      }
    } catch (parseError) {
      console.error('解析API响应失败:', parseError);
      console.log('原始响应内容 (前200字符):', responseText.substring(0, 200));
      throw new Error('解析HF API响应失败: ' + parseError.message);
    }
    
    return data;
  } catch (error) {
    console.error('获取Spaces列表时发生错误:', error);
    
    // 提供更详细的错误信息
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('网络请求失败，可能是网络连接问题或CORS限制');
    } else if (error.name === 'SyntaxError') {
      console.error('JSON解析错误，响应不是有效的JSON格式');
    }
    
    throw error;
  }
}

// 获取指定用户的Spaces
async function fetchUserSpaces(username, token) {
  try {
    console.log(`开始获取用户 ${username} 的Spaces...`);
    
    const spaces = await fetchSpacesWithToken(token, username);
    // 修改：spaces已经是通过作者过滤的，不需要再次过滤，但为保险起见还是进行验证
    const userSpaces = spaces.filter(space => {
      // 检查space对象中的各种可能的用户标识字段
      const spaceOwner = space.author || space.owner || '';
      const spaceUsername = space.username || '';
      const spaceId = space.id || '';
      
      // 记录不匹配的空间
      if (spaceOwner !== username && !spaceId.startsWith(`${username}/`)) {
        console.warn(`发现不属于用户 ${username} 的空间:`, {
          id: spaceId,
          author: spaceOwner,
          username: spaceUsername
        });
      }
      
      // 通过ID或author/owner字段匹配
      return spaceOwner === username || spaceId.startsWith(`${username}/`);
    });
    
    console.log(`用户 ${username} 有 ${userSpaces.length} 个Spaces，准备获取详细信息`);
    
    // 获取每个Space的详细信息
    const enrichedSpaces = [];
    for (const space of userSpaces) {
      try {
        // 获取当前Space的ID
        const spaceId = space.id;
        if (!spaceId) {
          console.warn(`Space缺少ID，跳过详细信息获取:`, space);
          continue;
        }
        
        // 获取详细信息
        const spaceDetails = await fetchSpaceDetails(spaceId, token);
        
        if (spaceDetails) {
          // 提取运行时信息
          const spaceRuntime = spaceDetails.runtime || {};
          
          // 合并基本信息和详细信息
          const enrichedSpace = {
            repo_id: spaceDetails.id,
            name: spaceDetails.cardData?.title || spaceDetails.id.split('/')[1],
            owner: spaceDetails.author,
            username: username,
            url: `https://${spaceDetails.author}-${spaceDetails.id.split('/')[1]}.hf.space`,
            status: spaceRuntime.stage || 'unknown',
            last_modified: spaceDetails.lastModified || 'unknown',
            created_at: spaceDetails.createdAt || 'unknown',
            sdk: spaceDetails.sdk || 'unknown',
            tags: spaceDetails.tags || [],
            private: spaceDetails.private || false,
            app_port: spaceDetails.cardData?.app_port || 'unknown'
          };
          
          enrichedSpaces.push(enrichedSpace);
          console.log(`成功添加详细信息 (${spaceId}), 状态: ${enrichedSpace.status}`);
        } else {
          // 如果无法获取详细信息，使用基本信息
          console.warn(`无法获取详细信息 (${spaceId}), 使用基本信息`);
          
          // 保留原始字段，但添加或规范化必要的字段
          const fallbackSpace = {
            ...space,
            // 确保username字段存在，用于后续过滤
            username: username,
            // 确保repo_id字段存在（API可能返回的是id）
            repo_id: space.repo_id || space.id || '',
            // 确保name字段存在
            name: space.name || space.title || (space.id ? space.id.split('/')[1] : '') || '',
            // 确保owner/author字段一致
            owner: space.owner || space.author || username,
            // 确保status字段存在
            status: space.status || 'unknown',
            // 确保last_modified字段存在
            last_modified: space.last_modified || space.updatedAt || space.updated_at || new Date().toISOString(),
            // 标准化URL
            url: space.url || (space.id ? `https://huggingface.co/spaces/${space.id}` : '')
          };
          
          enrichedSpaces.push(fallbackSpace);
        }
      } catch (error) {
        console.error(`处理Space详细信息时出错:`, error);
        // 使用基本信息作为后备
        const fallbackSpace = {
          ...space,
          username: username,
          repo_id: space.repo_id || space.id || '',
          name: space.name || space.title || (space.id ? space.id.split('/')[1] : '') || '',
          owner: space.owner || space.author || username,
          status: 'unknown',
          last_modified: space.last_modified || space.updatedAt || space.updated_at || new Date().toISOString(),
          url: space.url || (space.id ? `https://huggingface.co/spaces/${space.id}` : '')
        };
        
        enrichedSpaces.push(fallbackSpace);
      }
    }
    
    console.log(`用户 ${username} 的Spaces详细信息获取完成，成功获取 ${enrichedSpaces.length} 个`);
    
    // 如果用户有Spaces，记录第一个Space的关键字段值
    if (enrichedSpaces.length > 0) {
      const firstSpace = enrichedSpaces[0];
      console.log(`用户 ${username} 的第一个Space关键字段:`, {
        id: firstSpace.repo_id,
        name: firstSpace.name,
        status: firstSpace.status
      });
    } else {
      console.log(`用户 ${username} 没有Spaces或没有获取到`);
    }
    
    return enrichedSpaces;
  } catch (error) {
    console.error(`获取用户 ${username} 的Spaces失败:`, error);
    return null;
  }
}

// 获取Space详细信息
async function fetchSpaceDetails(spaceId, token) {
  try {
    console.log(`开始获取Space详细信息: ${spaceId}`);
    
    // 构建请求URL
    const url = `https://huggingface.co/api/spaces/${spaceId}`;
    console.log('请求详细信息URL:', url);
    
    // 发送请求
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`Space详细信息API响应状态 (${spaceId}):`, response.status, response.statusText);
    
    if (!response.ok) {
      console.error(`获取Space详细信息失败 (${spaceId}), 状态码:`, response.status);
      return null;
    }
    
    // 获取响应文本
    const responseText = await response.text();
    
    // 如果响应为空，返回null
    if (!responseText.trim()) {
      console.warn(`Space详细信息响应为空 (${spaceId})`);
      return null;
    }
    
    // 解析响应
    try {
      const data = JSON.parse(responseText);
      console.log(`成功获取Space详细信息 (${spaceId})`);
      
      // 记录关键字段
      const runtimeStage = data.runtime?.stage || 'unknown';
      console.log(`Space ${spaceId} 状态:`, runtimeStage);
      
      return data;
    } catch (parseError) {
      console.error(`解析Space详细信息响应失败 (${spaceId}):`, parseError);
      console.log(`详细信息原始响应 (前200字符):`, responseText.substring(0, 200));
      return null;
    }
  } catch (error) {
    console.error(`获取Space详细信息时发生错误 (${spaceId}):`, error);
    return null;
  }
} 
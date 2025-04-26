// 实时监控流API
// 这个API使用Server-Sent Events (SSE)发送实时监控数据
export async function onRequest(context) {
  try {
    // 获取要监控的Space IDs列表
    const url = new URL(context.request.url);
    const instancesParam = url.searchParams.get('instances');
    
    if (!instancesParam) {
      return new Response(JSON.stringify({
        error: '缺少instances参数'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const instances = instancesParam.split(',').filter(id => id.trim() !== '');
    console.log(`收到监控请求，实例列表: ${instances.join(', ')}`);
    
    // 从环境变量获取用户-令牌映射
    const userTokenMapping = {};
    const hfUserConfig = context.env.HF_USER || '';
    
    if (hfUserConfig) {
      hfUserConfig.split(',').forEach(pair => {
        const parts = pair.split(':').map(part => part.trim());
        const username = parts[0];
        const token = parts[1] || '';
        if (username && token) {
          userTokenMapping[username] = token;
        }
      });
    }
    
    // 全局API令牌（当没有特定用户令牌时使用）
    const globalApiToken = context.env.HF_API_TOKEN;
    
    if (Object.keys(userTokenMapping).length === 0 && !globalApiToken) {
      return new Response(JSON.stringify({
        error: 'API令牌未配置，无法获取监控数据'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 创建一个TransformStream用于生成SSE
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // 发送初始连接消息
    await writer.write(new TextEncoder().encode('event: connected\ndata: {"status":"connected"}\n\n'));
    
    // 跟踪轮询状态
    let isPolling = true;
    
    // 启动异步轮询
    const pollInterval = 3000; // 3秒钟轮询一次
    let consecutiveErrors = 0; // 跟踪连续错误数
    const maxConsecutiveErrors = 5; // 最大连续错误数，超过将增加轮询间隔
    
    const pollMetrics = async () => {
      if (!isPolling) return;
      
      try {
        // 遍历所有实例并获取其指标
        for (const spaceId of instances) {
          try {
            // 确定使用哪个令牌
            let token = globalApiToken;
            let username = '';
            
            // 从space ID中提取用户名
            if (spaceId.includes('/')) {
              username = spaceId.split('/')[0];
              // 如果有该用户的专用令牌，则使用它
              if (userTokenMapping[username]) {
                token = userTokenMapping[username];
              }
            }
            
            // 构建请求URL
            // 使用v1 API获取实时指标
            const apiUrl = `https://api.hf.space/v1/${username}/${spaceId.split('/')[1]}/metrics`;
            console.log(`获取指标: ${apiUrl.replace(username, '***')}`);
            
            const response = await fetch(apiUrl, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
              }
            });
            
            if (response.ok) {
              const rawMetrics = await response.json();
              
              // 转换数据格式，适配前端期望的格式
              // 前端期望格式: { cpu: number, memory: number, net_up: number, net_down: number }
              const metrics = {
                cpu: parseFloat(rawMetrics.system?.cpu_usage || 0) / 100, // 转换为0-1之间的值
                memory: parseFloat(rawMetrics.system?.memory_usage || 0) * 1024 * 1024, // 转换为字节
                net_up: parseFloat(rawMetrics.network?.tx_bytes_per_sec || 0),
                net_down: parseFloat(rawMetrics.network?.rx_bytes_per_sec || 0)
              };
              
              const event = {
                event: 'metric',
                data: JSON.stringify({
                  repoId: spaceId,
                  metrics: metrics
                })
              };
              
              // 编码为SSE格式
              const message = `event: ${event.event}\ndata: ${event.data}\n\n`;
              
              // 写入流
              await writer.write(new TextEncoder().encode(message));
              
              // 重置连续错误计数
              consecutiveErrors = 0;
            } else {
              console.error(`获取Space(${spaceId})监控指标失败，状态码:`, response.status);
              
              // 如果是404错误，可能是space不存在或不在运行中
              if (response.status === 404) {
                // 发送空数据，确保前端能显示默认值
                const fallbackMetrics = {
                  cpu: 0,
                  memory: 0,
                  net_up: 0,
                  net_down: 0
                };
                
                const event = {
                  event: 'metric',
                  data: JSON.stringify({
                    repoId: spaceId,
                    metrics: fallbackMetrics
                  })
                };
                
                await writer.write(new TextEncoder().encode(`event: ${event.event}\ndata: ${event.data}\n\n`));
              }
              
              consecutiveErrors++;
            }
          } catch (error) {
            console.error(`获取Space(${spaceId})监控指标错误:`, error);
            consecutiveErrors++;
          }
        }
        
        // 保持连接活跃的心跳消息
        await writer.write(new TextEncoder().encode('event: ping\ndata: {"timestamp":' + Date.now() + '}\n\n'));
        
        // 根据连续错误数调整轮询间隔
        let currentInterval = pollInterval;
        if (consecutiveErrors > maxConsecutiveErrors) {
          // 指数退避，最长不超过30秒
          currentInterval = Math.min(pollInterval * Math.pow(1.5, consecutiveErrors - maxConsecutiveErrors), 30000);
          console.log(`连续错误过多，增加轮询间隔至 ${currentInterval}ms`);
        }
        
        // 安排下一次轮询
        setTimeout(pollMetrics, currentInterval);
      } catch (error) {
        console.error('轮询监控指标错误:', error);
        
        // 增加连续错误计数
        consecutiveErrors++;
        
        // 即使出错也继续轮询，但可能会增加间隔
        let retryInterval = pollInterval;
        if (consecutiveErrors > maxConsecutiveErrors) {
          // 指数退避，最长不超过30秒
          retryInterval = Math.min(pollInterval * Math.pow(1.5, consecutiveErrors - maxConsecutiveErrors), 30000);
        }
        
        setTimeout(pollMetrics, retryInterval);
      }
    };
    
    // 开始轮询
    pollMetrics();
    
    // 处理客户端断开连接
    context.waitUntil(
      new Promise((resolve) => {
        // 如果读取端关闭，停止轮询
        stream.readable.pipeTo(new WritableStream({}))
          .catch(() => {
            console.log('客户端断开连接，停止轮询');
            isPolling = false;
            resolve();
          });
      })
    );
    
    // 返回SSE流
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
    
  } catch (error) {
    console.error('创建监控流错误:', error);
    return new Response(JSON.stringify({
      error: '创建监控流失败: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
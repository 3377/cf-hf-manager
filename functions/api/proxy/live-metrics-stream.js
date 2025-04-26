// 实时监控流API
// 这个API使用Server-Sent Events (SSE)发送实时监控数据
export async function onRequest(context) {
  // 验证是否已通过认证
  if (!context.session) {
    return new Response(JSON.stringify({
      error: '未授权操作'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
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
    
    const instances = instancesParam.split(',');
    
    // 从环境变量获取HF API令牌
    const apiToken = context.env.HF_API_TOKEN;
    
    if (!apiToken) {
      return new Response(JSON.stringify({
        error: 'API令牌未配置'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 创建一个TransformStream用于生成SSE
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // 启动异步轮询
    const pollInterval = 5000; // 5秒
    const pollMetrics = async () => {
      try {
        // 遍历所有实例并获取其指标
        for (const spaceId of instances) {
          try {
            const response = await fetch(`https://huggingface.co/api/spaces/${spaceId}/runtime/metrics`, {
              headers: {
                'Authorization': `Bearer ${apiToken}`
              }
            });
            
            if (response.ok) {
              const metrics = await response.json();
              
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
            }
          } catch (error) {
            console.error(`获取Space(${spaceId})监控指标错误:`, error);
          }
        }
        
        // 保持连接活跃的心跳消息
        await writer.write(new TextEncoder().encode('event: ping\ndata: {}\n\n'));
        
        // 安排下一次轮询
        setTimeout(pollMetrics, pollInterval);
      } catch (error) {
        console.error('轮询监控指标错误:', error);
        writer.close();
      }
    };
    
    // 开始轮询
    pollMetrics();
    
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
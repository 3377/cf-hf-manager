// 全局变量
let allSpaces = [];
let sseConnection = null;
let metricsConnectionId = null;
let activeMetricsSubscriptions = [];
const API_BASE_URL = '';

// 调试标志 - 设置为true以启用更详细的日志记录
const DEBUG = true;

// 页面加载时执行
document.addEventListener('DOMContentLoaded', () => {
  // 输出调试信息
  if (DEBUG) {
    console.log('应用程序启动，API基础URL:', API_BASE_URL);
    document.getElementById('stats-container').innerHTML = '<div class="loading-message">正在初始化应用...</div>';
  }

  // 初始化主题设置
  initTheme();

  // 初始化过滤器
  initFilters();

  // 初始化模态框
  initLoginModal();
  initConfirmModal();

  // 测试API连接
  testApiConnection().then(result => {
    if (result.success) {
      // 如果API连接测试成功，继续加载应用
      // 加载配置
      loadConfig();
      
      // 检查登录状态
      checkLoginStatus().then(loggedIn => {
        if (loggedIn) {
          console.log('已登录，可操作');
        } else {
          console.log('未登录，仅查看模式');
        }
      });

      // 加载服务器列表
      loadSpaces();
    } else {
      // 如果API连接测试失败，显示错误信息
      document.getElementById('stats-container').innerHTML = 
        `<div class="loading-message error">
          <h3>API连接失败</h3>
          <p>${result.message}</p>
          <div class="api-debug-info">
            <h4>调试信息</h4>
            <pre>${JSON.stringify(result.details || {}, null, 2)}</pre>
            <button onclick="testApiConnection().then(res => { 
              document.getElementById('stats-container').innerHTML = 
                '<pre>' + JSON.stringify(res, null, 2) + '</pre>'; 
            })">重新测试API</button>
            <button onclick="loadSpaces()">尝试加载Spaces</button>
          </div>
        </div>`;
    }
  });
});

// 测试API连接
async function testApiConnection() {
  if (DEBUG) console.log('测试API连接...');
  
  try {
    // 首先测试测试配置端点
    const testConfigResult = await fetch(`${API_BASE_URL}/api/test-config`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`测试配置端点返回状态码: ${response.status}`);
        }
        return response.json();
      })
      .catch(error => {
        if (DEBUG) console.error('测试配置端点错误:', error);
        return { error: `测试配置端点错误: ${error.message}` };
      });
    
    if (testConfigResult.error) {
      // 配置测试失败，但我们可以尝试直接测试spaces端点
      if (DEBUG) console.log('测试配置端点失败，尝试直接测试spaces端点');
      
      return await fetch(`${API_BASE_URL}/api/proxy/spaces`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Spaces API返回状态码: ${response.status}`);
          }
          // 尝试读取响应体，看看是否有有效数据
          return response.text().then(text => {
            try {
              const data = JSON.parse(text);
              return { 
                success: true, 
                message: `API连接成功，获取到${data.length || 0}个spaces`, 
                details: { 
                  responseLength: text.length,
                  dataType: typeof data,
                  isArray: Array.isArray(data),
                  sampleData: Array.isArray(data) && data.length > 0 ? data[0] : null
                }
              };
            } catch (e) {
              // 响应不是有效的JSON
              return { 
                success: false, 
                message: '无法解析API响应为JSON', 
                details: { responseText: text.substring(0, 500) + (text.length > 500 ? '...' : '') }
              };
            }
          });
        })
        .catch(error => {
          return { 
            success: false, 
            message: `无法连接到Spaces API: ${error.message}`,
            details: { error: error.toString() }
          };
        });
    }
    
    // 配置测试成功
    return { 
      success: true, 
      message: 'API配置测试成功', 
      details: testConfigResult 
    };
  } catch (error) {
    if (DEBUG) console.error('API连接测试失败:', error);
    return { 
      success: false, 
      message: `API连接测试失败: ${error.message}`,
      details: { error: error.toString() }
    };
  }
}

// 初始化主题设置
function initTheme() {
  const theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);

  // 主题切换按钮
  document.getElementById('theme-system').addEventListener('click', () => {
    localStorage.setItem('theme', 'system');
    applyTheme('system');
  });

  document.getElementById('theme-light').addEventListener('click', () => {
    localStorage.setItem('theme', 'light');
    applyTheme('light');
  });

  document.getElementById('theme-dark').addEventListener('click', () => {
    localStorage.setItem('theme', 'dark');
    applyTheme('dark');
  });
}

// 应用主题
function applyTheme(theme) {
  if (theme === 'system') {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// 初始化登录模态框
function initLoginModal() {
  const modal = document.getElementById('login-modal');
  const loginBtn = document.getElementById('login-btn');
  const closeBtn = modal.querySelector('.close');
  const form = modal.querySelector('.modal-body');
  const loginError = document.getElementById('login-error');

  // 登录按钮点击
  loginBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    loginError.textContent = '';
    form.querySelector('#username').focus();
  });

  // 关闭按钮点击
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // 点击模态框外部关闭
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  // 回车键提交表单
  form.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('login-submit').click();
    }
  });

  // 提交登录
  document.getElementById('login-submit').addEventListener('click', login);
}

// 初始化确认模态框
function initConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  const closeBtn = modal.querySelector('.close');
  const cancelBtn = document.getElementById('confirm-cancel');

  // 关闭按钮点击
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // 取消按钮点击
  cancelBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // 点击模态框外部关闭
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
}

// 初始化过滤器
function initFilters() {
  const statusFilter = document.getElementById('status-filter');
  const userFilter = document.getElementById('user-filter');

  statusFilter.addEventListener('change', applyFilters);
  userFilter.addEventListener('change', applyFilters);
}

// 应用过滤器
function applyFilters() {
  const statusFilter = document.getElementById('status-filter').value;
  const userFilter = document.getElementById('user-filter').value;
  const userGroups = document.querySelectorAll('.user-group');

  userGroups.forEach(group => {
    // 用户过滤
    if (userFilter === 'all' || group.getAttribute('data-user') === userFilter) {
      group.style.display = 'block';
      
      // 状态过滤
      const cards = group.querySelectorAll('.server-card');
      let hasVisibleCards = false;
      
      cards.forEach(card => {
        const status = card.getAttribute('data-status');
        if (statusFilter === 'all' || status === statusFilter) {
          card.style.display = 'flex';
          hasVisibleCards = true;
        } else {
          card.style.display = 'none';
        }
      });
      
      // 如果该用户组内没有可见卡片，则隐藏整个用户组
      if (!hasVisibleCards) {
        group.style.display = 'none';
      }
    } else {
      group.style.display = 'none';
    }
  });
}

// 加载配置
async function loadConfig() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config`);
    const data = await response.json();
    
    // 填充用户过滤器
    if (data.usernames) {
      const userFilter = document.getElementById('user-filter');
      userFilter.innerHTML = '<option value="all">全部</option>';
      
      data.usernames.split(',').forEach(username => {
        if (username.trim()) {
          const option = document.createElement('option');
          option.value = username.trim();
          option.textContent = username.trim();
          userFilter.appendChild(option);
        }
      });
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

// 检查登录状态
async function checkLoginStatus() {
  const token = localStorage.getItem('token');
  if (!token) {
    updateLoginState(false);
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      updateLoginState(true);
      return true;
    } else {
      localStorage.removeItem('token');
      updateLoginState(false);
      return false;
    }
  } catch (error) {
    console.error('验证登录状态失败:', error);
    updateLoginState(false);
    return false;
  }
}

// 更新登录状态UI
function updateLoginState(loggedIn) {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  
  if (loggedIn) {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'block';
    
    // 退出登录事件
    logoutBtn.onclick = logout;
    
    // 显示操作按钮
    document.querySelectorAll('.server-card').forEach(card => {
      card.classList.remove('not-logged-in');
      const actions = card.querySelector('.server-actions');
      if (actions) {
        actions.style.display = 'flex';
      }
    });
  } else {
    loginBtn.style.display = 'block';
    logoutBtn.style.display = 'none';
    
    // 隐藏操作按钮
    document.querySelectorAll('.server-card').forEach(card => {
      card.classList.add('not-logged-in');
      const actions = card.querySelector('.server-actions');
      if (actions) {
        actions.style.display = 'none';
      }
    });
  }
}

// 登录
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const loginError = document.getElementById('login-error');
  
  if (!username || !password) {
    loginError.textContent = '请输入用户名和密码';
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      localStorage.setItem('token', data.token);
      document.getElementById('login-modal').style.display = 'none';
      updateLoginState(true);
      
      // 刷新UI，显示操作按钮
      updateSpacesUI();
    } else {
      loginError.textContent = data.message || '登录失败';
    }
  } catch (error) {
    console.error('登录请求失败:', error);
    loginError.textContent = '登录请求失败，请重试';
  }
}

// 登出
async function logout() {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  try {
    await fetch(`${API_BASE_URL}/api/v1/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // 清除本地存储的 token
    localStorage.removeItem('token');
    
    // 更新 UI 状态
    updateLoginState(false);
    
    // 重新加载页面以刷新状态
    // location.reload();
  } catch (error) {
    console.error('登出请求失败:', error);
  }
}

// 加载 Spaces 列表
async function loadSpaces() {
  try {
    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = '<div class="loading-message">加载 Spaces 数据...</div>';
    
    if (DEBUG) console.log('开始请求Spaces列表:', `${API_BASE_URL}/api/proxy/spaces`);
    
    const response = await fetch(`${API_BASE_URL}/api/proxy/spaces`);
    
    if (DEBUG) console.log('Spaces API响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`加载 Spaces 失败: ${response.status}`);
    }
    
    // 获取响应文本以便调试
    const responseText = await response.text();
    
    if (DEBUG) console.log('Spaces API响应长度:', responseText.length, '字节');
    
    // 尝试解析响应
    try {
      allSpaces = JSON.parse(responseText);
      
      if (DEBUG) {
        console.log(`解析成功，获取到 ${allSpaces.length} 个Spaces`);
        if (allSpaces.length > 0) {
          console.log('第一个Space样本:', allSpaces[0]);
        }
      }
      
      // 更新统计数据
      updateSummary();
      
      // 更新 UI
      updateSpacesUI();
      
      // 初始化实时监控
      connectToMetrics();
    } catch (parseError) {
      console.error('解析Spaces响应失败:', parseError);
      statsContainer.innerHTML = `
        <div class="loading-message error">
          <p>解析Spaces数据失败: ${parseError.message}</p>
          <div class="api-debug-info">
            <h4>响应内容预览 (前500字符)</h4>
            <pre>${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}</pre>
          </div>
        </div>`;
    }
  } catch (error) {
    console.error('加载 Spaces 失败:', error);
    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = `
      <div class="loading-message error">
        <p>加载失败: ${error.message}</p>
        <button onclick="loadSpaces()">重试</button>
        <button onclick="testApiConnection().then(res => { 
          document.getElementById('stats-container').innerHTML = 
            '<pre>' + JSON.stringify(res, null, 2) + '</pre>'; 
        })">测试API连接</button>
      </div>`;
  }
}

// 更新统计数据
function updateSummary() {
  document.getElementById('total-count').textContent = allSpaces.length;
  
  const runningCount = allSpaces.filter(space => space.status === 'running').length;
  document.getElementById('running-count').textContent = runningCount;
  
  const stoppedCount = allSpaces.filter(space => space.status === 'stopped').length;
  document.getElementById('stopped-count').textContent = stoppedCount;
  
  const privateCount = allSpaces.filter(space => space.private).length;
  document.getElementById('private-count').textContent = privateCount;
}

// 更新 Spaces UI
function updateSpacesUI() {
  const statsContainer = document.getElementById('stats-container');
  statsContainer.innerHTML = '';
  
  // 检查登录状态
  const isLoggedIn = !!localStorage.getItem('token');
  
  // 按用户分组
  const groupedByUser = {};
  allSpaces.forEach(space => {
    if (!groupedByUser[space.username]) {
      groupedByUser[space.username] = [];
    }
    groupedByUser[space.username].push(space);
  });
  
  // 创建每个用户的卡片组
  Object.keys(groupedByUser).sort().forEach(username => {
    const spaces = groupedByUser[username];
    
    // 创建用户组元素
    const userGroup = document.createElement('details');
    userGroup.className = 'user-group';
    userGroup.setAttribute('data-user', username);
    userGroup.setAttribute('open', 'true');
    
    // 创建用户组标题
    const summary = document.createElement('summary');
    summary.textContent = `${username} (${spaces.length})`;
    userGroup.appendChild(summary);
    
    // 创建服务器列表容器
    const serversDiv = document.createElement('div');
    serversDiv.className = 'user-servers';
    
    // 为每个 Space 创建卡片
    spaces.forEach(space => {
      const card = createServerCard(space);
      serversDiv.appendChild(card);
    });
    
    userGroup.appendChild(serversDiv);
    statsContainer.appendChild(userGroup);
  });
  
  // 应用过滤器
  applyFilters();
}

// 创建服务器卡片
function createServerCard(space) {
  const isLoggedIn = !!localStorage.getItem('token');
  
  // 创建卡片容器
  const card = document.createElement('div');
  card.className = `server-card${isLoggedIn ? '' : ' not-logged-in'}`;
  card.setAttribute('data-id', space.repo_id);
  card.setAttribute('data-status', space.status);
  
  // 创建卡片头部
  const header = document.createElement('div');
  header.className = 'server-header';
  
  // 创建名称部分
  const nameDiv = document.createElement('div');
  nameDiv.className = 'server-name';
  
  const nameText = document.createElement('div');
  nameText.textContent = space.name;
  nameDiv.appendChild(nameText);
  
  // 创建状态标签
  const statusDiv = document.createElement('div');
  statusDiv.className = `server-status status-${space.status}`;
  statusDiv.textContent = space.status;
  
  // 组装头部
  header.appendChild(nameDiv);
  header.appendChild(statusDiv);
  card.appendChild(header);
  
  // 创建信息区域
  const infoDiv = document.createElement('div');
  infoDiv.className = 'server-info';
  
  // 添加链接
  const linkDiv = document.createElement('div');
  const linkIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  linkIcon.setAttribute('viewBox', '0 0 24 24');
  linkIcon.innerHTML = '<path d="M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8z"/>';
  
  const linkA = document.createElement('a');
  linkA.href = space.url;
  linkA.target = '_blank';
  linkA.textContent = space.url;
  
  linkDiv.appendChild(linkIcon);
  linkDiv.appendChild(linkA);
  infoDiv.appendChild(linkDiv);
  
  // 添加ID信息
  const idDiv = document.createElement('div');
  idDiv.textContent = `ID: ${space.repo_id}`;
  infoDiv.appendChild(idDiv);
  
  // 添加最后更新时间
  const lastModifiedDiv = document.createElement('div');
  const lastModifiedDate = new Date(space.last_modified);
  lastModifiedDiv.textContent = `最后更新: ${lastModifiedDate.toLocaleString()}`;
  infoDiv.appendChild(lastModifiedDiv);
  
  card.appendChild(infoDiv);
  
  // 创建监控区域
  const metricsDiv = document.createElement('div');
  metricsDiv.className = 'metrics';
  metricsDiv.style.display = 'none';
  
  // 监控标题
  const metricsTitle = document.createElement('div');
  metricsTitle.className = 'metrics-title';
  metricsTitle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3v16h16v2H3V3h2zm15.293 3.293l1.414 1.414L16 13.414l-3-2.999-4.293 4.292-1.414-1.414L13 7.586l3 2.999 4.293-4.292z"/></svg> 实时监控';
  metricsDiv.appendChild(metricsTitle);
  
  // CPU和内存监控
  const metricsContainer = document.createElement('div');
  metricsContainer.className = 'metrics-container';
  
  // CPU指标
  const cpuMetric = document.createElement('div');
  cpuMetric.className = 'metric-card';
  cpuMetric.innerHTML = 'CPU<div class="metric-value">--</div>';
  metricsContainer.appendChild(cpuMetric);
  
  // 内存指标
  const memoryMetric = document.createElement('div');
  memoryMetric.className = 'metric-card';
  memoryMetric.innerHTML = '内存<div class="metric-value">--</div>';
  metricsContainer.appendChild(memoryMetric);
  
  metricsDiv.appendChild(metricsContainer);
  
  // 网络监控
  const networkMetrics = document.createElement('div');
  networkMetrics.className = 'network-metrics';
  
  const networkContainer = document.createElement('div');
  networkContainer.className = 'metrics-container';
  
  // 下载速率
  const downloadMetric = document.createElement('div');
  downloadMetric.className = 'metric-card';
  downloadMetric.innerHTML = '下载速率<div class="metric-value">--</div>';
  networkContainer.appendChild(downloadMetric);
  
  // 上传速率
  const uploadMetric = document.createElement('div');
  uploadMetric.className = 'metric-card';
  uploadMetric.innerHTML = '上传速率<div class="metric-value">--</div>';
  networkContainer.appendChild(uploadMetric);
  
  networkMetrics.appendChild(networkContainer);
  metricsDiv.appendChild(networkMetrics);
  
  card.appendChild(metricsDiv);
  
  // 创建操作按钮区域
  if (isLoggedIn) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'server-actions';
    
    // 重启按钮
    const restartBtn = document.createElement('button');
    restartBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5.463 4.433A9.961 9.961 0 0 1 12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.81 5.74L17 12h3A8 8 0 0 0 6.46 6.228l-.997-1.795zm13.074 15.134A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.136.67-4.116 1.81-5.74L7 12H4a8 8 0 0 0 13.54 5.772l.997 1.795z"/></svg> 重启';
    restartBtn.onclick = () => confirmRestart(space);
    actionsDiv.appendChild(restartBtn);
    
    // 重建按钮
    const rebuildBtn = document.createElement('button');
    rebuildBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M2 12h2v5h16v-5h2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5zm10-7.792L8.854 8.354 7.44 6.94l4.56-4.56 4.56 4.56-1.414 1.414L13 4.208V16h-2V4.208z"/></svg> 重建';
    rebuildBtn.onclick = () => confirmRebuild(space);
    actionsDiv.appendChild(rebuildBtn);
    
    card.appendChild(actionsDiv);
  }
  
  return card;
}

// 确认重启 Space
function confirmRestart(space) {
  const modal = document.getElementById('confirm-modal');
  const message = document.getElementById('confirm-message');
  const confirmBtn = document.getElementById('confirm-ok');
  
  message.textContent = `确定要重启 Space "${space.name}" 吗？`;
  modal.style.display = 'flex';
  
  confirmBtn.onclick = () => {
    modal.style.display = 'none';
    restartSpace(space);
  };
}

// 确认重建 Space
function confirmRebuild(space) {
  const modal = document.getElementById('confirm-modal');
  const message = document.getElementById('confirm-message');
  const confirmBtn = document.getElementById('confirm-ok');
  
  message.textContent = `确定要重建 Space "${space.name}" 吗？这将重新构建整个 Space 环境，可能需要较长时间。`;
  modal.style.display = 'flex';
  
  confirmBtn.onclick = () => {
    modal.style.display = 'none';
    rebuildSpace(space);
  };
}

// 重启 Space
async function restartSpace(space) {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  try {
    const card = document.querySelector(`.server-card[data-id="${space.repo_id}"]`);
    const statusDiv = card.querySelector('.server-status');
    const actionBtns = card.querySelectorAll('.server-actions button');
    
    // 更新 UI 状态
    statusDiv.textContent = '重启中...';
    statusDiv.className = 'server-status status-building';
    actionBtns.forEach(btn => btn.disabled = true);
    
    // 发送重启请求
    const response = await fetch(`${API_BASE_URL}/api/proxy/restart/${space.repo_id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`重启失败: ${response.status}`);
    }
    
    // 更新 space 状态
    space.status = 'building';
    
    // 5秒后刷新列表
    setTimeout(() => loadSpaces(), 5000);
  } catch (error) {
    console.error('重启 Space 失败:', error);
    alert(`重启 Space 失败: ${error.message}`);
  }
}

// 重建 Space
async function rebuildSpace(space) {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  try {
    const card = document.querySelector(`.server-card[data-id="${space.repo_id}"]`);
    const statusDiv = card.querySelector('.server-status');
    const actionBtns = card.querySelectorAll('.server-actions button');
    
    // 更新 UI 状态
    statusDiv.textContent = '重建中...';
    statusDiv.className = 'server-status status-building';
    actionBtns.forEach(btn => btn.disabled = true);
    
    // 发送重建请求
    const response = await fetch(`${API_BASE_URL}/api/proxy/rebuild/${space.repo_id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`重建失败: ${response.status}`);
    }
    
    // 更新 space 状态
    space.status = 'building';
    
    // 10秒后刷新列表
    setTimeout(() => loadSpaces(), 10000);
  } catch (error) {
    console.error('重建 Space 失败:', error);
    alert(`重建 Space 失败: ${error.message}`);
  }
}

// 连接到监控指标
function connectToMetrics() {
  // 生成随机客户端ID
  metricsConnectionId = Math.random().toString(36).substring(2, 15);
  
  // 获取所有运行中的Spaces作为初始订阅
  const runningSpaces = allSpaces.filter(space => space.status === 'running');
  activeMetricsSubscriptions = runningSpaces.map(space => space.repo_id);
  
  // 如果没有运行中的Spaces，不建立连接
  if (activeMetricsSubscriptions.length === 0) {
    return;
  }
  
  // 使用SSE建立监控连接
  const url = new URL(`${API_BASE_URL}/api/proxy/live-metrics-stream`);
  url.searchParams.append('instances', activeMetricsSubscriptions.join(','));
  
  sseConnection = new EventSource(url);
  
  // 监听监控数据事件
  sseConnection.addEventListener('metric', function(event) {
    try {
      const data = JSON.parse(event.data);
      updateMetricsUI(data.repoId, data.metrics);
    } catch (error) {
      console.error('解析监控数据错误:', error);
    }
  });
  
  // 错误处理
  sseConnection.addEventListener('error', function(event) {
    console.error('SSE连接错误:', event);
    // 尝试重连
    setTimeout(() => {
      if (sseConnection) {
        sseConnection.close();
        connectToMetrics();
      }
    }, 5000);
  });
  
  // 页面卸载时关闭连接
  window.addEventListener('beforeunload', () => {
    if (sseConnection) {
      sseConnection.close();
    }
  });
}

// 更新监控指标UI
function updateMetricsUI(repoId, metrics) {
  const serverCard = document.querySelector(`.server-card[data-id="${repoId}"]`);
  if (!serverCard) return;
  
  // 显示监控区域
  const metricsDiv = serverCard.querySelector('.metrics');
  metricsDiv.style.display = 'block';
  
  // 更新CPU使用率
  const cpuValue = serverCard.querySelector('.metric-card:nth-child(1) .metric-value');
  if (metrics.cpu !== undefined) {
    const cpuPercent = (metrics.cpu * 100).toFixed(1);
    cpuValue.textContent = `${cpuPercent}%`;
  }
  
  // 更新内存使用
  const memoryValue = serverCard.querySelector('.metric-card:nth-child(2) .metric-value');
  if (metrics.memory !== undefined) {
    const memoryMB = (metrics.memory / (1024 * 1024)).toFixed(1);
    memoryValue.textContent = `${memoryMB} MB`;
  }
  
  // 更新网络下载速率
  const downloadValue = serverCard.querySelector('.network-metrics .metric-card:nth-child(1) .metric-value');
  if (metrics.net_down !== undefined) {
    const downloadKB = (metrics.net_down / 1024).toFixed(1);
    downloadValue.textContent = `${downloadKB} KB/s`;
  }
  
  // 更新网络上传速率
  const uploadValue = serverCard.querySelector('.network-metrics .metric-card:nth-child(2) .metric-value');
  if (metrics.net_up !== undefined) {
    const uploadKB = (metrics.net_up / 1024).toFixed(1);
    uploadValue.textContent = `${uploadKB} KB/s`;
  }
}

// 格式化字节大小为可读字符串
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 更新指标订阅
function updateMetricsSubscriptions() {
  if (!sseConnection || !metricsConnectionId) return;
  
  // 获取所有运行中的Spaces
  const runningSpaces = allSpaces.filter(space => space.status === 'running');
  const newSubscriptions = runningSpaces.map(space => space.repo_id);
  
  // 如果订阅列表没有变化，不更新
  if (JSON.stringify(activeMetricsSubscriptions) === JSON.stringify(newSubscriptions)) {
    return;
  }
  
  // 更新订阅列表
  activeMetricsSubscriptions = newSubscriptions;
  
  // 发送更新请求
  fetch(`${API_BASE_URL}/api/proxy/update-subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientId: metricsConnectionId,
      instances: activeMetricsSubscriptions
    })
  }).catch(error => {
    console.error('更新监控订阅错误:', error);
  });
}
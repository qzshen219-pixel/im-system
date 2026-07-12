const API = 'http://172.22.120.246:8080';
let currentUser = null;
let ws = null;
let currentTarget = null;
let conversations = {};
let messages = {};
let groups = {};
let searchTimer = null;

// ==================== 页面切换 ====================
function showPage(id) {
    console.log('showPage:', id);
    document.querySelectorAll('[id^="page-"]').forEach(p => {
        p.classList.add('hidden');
    });
    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        console.log('已显示页面:', id);
    } else {
        console.error('找不到元素:', id);
    }
}

function showTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.auth-tab[onclick="showTab('${tab}')"]`).classList.add('active');
    document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
}

// ==================== Toast 提示 ====================
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ==================== 认证 ====================
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;
    if (!username || !password) { showToast('请填写用户名和密码', 'error'); return; }
    
    try {
        const r = await fetch(`${API}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await r.json();
        if (data.code === 0) {
            currentUser = data.data;
            sessionStorage.setItem('user', JSON.stringify(currentUser));
            enterChat();
        } else {
            showToast(data.message || '登录失败', 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-user').value.trim();
    const password = document.getElementById('reg-pass').value;
    const password2 = document.getElementById('reg-pass2').value;
    const nickname = document.getElementById('reg-nick').value.trim();
    
    if (!username || !password) { showToast('请填写用户名和密码', 'error'); return; }
    if (password !== password2) { showToast('两次密码不一致', 'error'); return; }
    if (password.length < 6) { showToast('密码至少6位', 'error'); return; }
    
    try {
        const r = await fetch(`${API}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, nickname })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('注册成功，请登录');
            showTab('login');
            document.getElementById('login-user').value = username;
        } else {
            showToast(data.message || '注册失败', 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

function handleLogout() {
    if (ws) ws.close();
    currentUser = null;
    sessionStorage.removeItem('user');
    showPage('page-login');
}

// ==================== 进入聊天 ====================
function enterChat() {
    console.log('enterChat called, currentUser:', currentUser);
    document.getElementById('current-user').textContent = currentUser.nickname || currentUser.username;
    document.getElementById('currentAvatar').textContent = (currentUser.nickname || currentUser.username)[0];
    showPage('page-chat');
    connectWebSocket();
    loadFriends();
}

// ==================== WebSocket ====================
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;
const BASE_DELAY = 1000;

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    
    const wsUrl = `ws://172.22.120.246:8001`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket 连接成功');
        reconnectAttempts = 0;
        ws.send(JSON.stringify({
            type: 'login',
            user_id: currentUser.id,
            token: currentUser.token
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
    };
    
    ws.onclose = (event) => {
        console.log('WebSocket 连接关闭');
        if (reconnectAttempts < MAX_RECONNECT) {
            const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), 30000);
            console.log(`${delay/1000}秒后重连...`);
            setTimeout(() => {
                reconnectAttempts++;
                connectWebSocket();
            }, delay);
        } else {
            showToast('连接断开，请刷新页面', 'error');
        }
    };
    
    ws.onerror = (err) => console.error('WebSocket 错误:', err);
    
    // 心跳
    if (window.heartbeatTimer) clearInterval(window.heartbeatTimer);
    window.heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
    }, 30000);
}

function handleWsMessage(data) {
    switch (data.type) {
        case 'login_ok': console.log('登录成功'); break;
        case 'login_fail': showToast(data.message, 'error'); handleLogout(); break;
        case 'chat': receiveMessage(data); break;
        case 'group_chat': receiveGroupMessage(data); break;
        case 'read_receipt': break;
        case 'heartbeat_ack': break;
    }
}

// ==================== 消息接收 ====================
function receiveMessage(data) {
    const fromId = data.from;
    const content = data.content;
    const time = data.time || new Date().toLocaleTimeString();
    
    if (!conversations[fromId]) {
        conversations[fromId] = {
            id: fromId,
            name: data.from_name || '用户' + fromId,
            lastMsg: content,
            time: time,
            unread: 0
        };
    } else {
        conversations[fromId].lastMsg = content;
        conversations[fromId].time = time;
        if (currentTarget !== fromId) {
            conversations[fromId].unread = (conversations[fromId].unread || 0) + 1;
        }
    }
    
    if (!messages[fromId]) messages[fromId] = [];
    messages[fromId].push({
        from: fromId,
        content: content,
        file_id: data.file_id || null,
        time: time,
        self: false
    });
    
    renderConversations();
    if (currentTarget === fromId) renderMessages(fromId);
}

function receiveGroupMessage(data) {
    const groupId = data.group_id;
    const content = data.content;
    const time = data.time || new Date().toLocaleTimeString();
    
    if (!messages[groupId]) messages[groupId] = [];
    messages[groupId].push({
        from: data.from,
        from_name: data.from_name || '用户' + data.from,
        content: content,
        file_id: data.file_id || null,
        time: time,
        self: false
    });
    
    if (currentTarget === -groupId) {
        renderMessages(groupId);
    } else {
        showToast(`收到来自群组的新消息`);
    }
}

// ==================== 发送消息 ====================
function sendMessage() {
    const input = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content || !currentTarget) return;
    
    if (currentTarget < 0) { sendGroupMessage(); return; }
    
    const msg = {
        type: 'chat',
        to: currentTarget,
        content: content
    };
    
    ws.send(JSON.stringify(msg));
    
    if (!messages[currentTarget]) messages[currentTarget] = [];
    messages[currentTarget].push({
        from: currentUser.id,
        content: content,
        time: formatTime(new Date()),
        self: true
    });
    
    if (!conversations[currentTarget]) {
        conversations[currentTarget] = {
            id: currentTarget,
            name: '用户' + currentTarget,
            lastMsg: content,
            time: formatTime(new Date()),
            unread: 0
        };
    } else {
        conversations[currentTarget].lastMsg = content;
        conversations[currentTarget].time = formatTime(new Date());
    }
    
    renderMessages(currentTarget);
    renderConversations();
    input.value = '';
    input.focus();
}

function sendGroupMessage() {
    const input = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content || !currentTarget || currentTarget >= 0) return;
    
    const groupId = -currentTarget;
    ws.send(JSON.stringify({ type: 'group_chat', group_id: groupId, content: content }));
    
    if (!messages[groupId]) messages[groupId] = [];
    messages[groupId].push({
        from: currentUser.id,
        content: content,
        time: formatTime(new Date()),
        self: true,
        from_name: currentUser.nickname || currentUser.username
    });
    
    renderMessages(groupId);
    input.value = '';
    input.focus();
}

// ==================== 文件上传 ====================
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentTarget) { showToast('请先选择聊天对象', 'error'); event.target.value = ''; return; }
    
    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const base64Data = e.target.result.split(',')[1];
        const displayContent = isImage 
            ? `[图片] ${file.name} (${(file.size / 1024).toFixed(1)}KB)`
            : `[文件] ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
        
        fetch(`${API}/api/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: file.name,
                file_data: base64Data,
                from_user_id: currentUser.id,
                to_user_id: currentTarget >= 0 ? currentTarget : 0,
                file_type: isImage ? 'image' : 'file'
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.code === 0) {
                const msg = {
                    type: currentTarget < 0 ? 'group_chat' : 'chat',
                    content: displayContent,
                    msg_type: isImage ? 2 : 3,
                    file_id: data.data.file_id,
                    file_type: isImage ? 'image' : 'file'
                };
                
                if (currentTarget >= 0) msg.to = currentTarget;
                else msg.group_id = -currentTarget;
                
                ws.send(JSON.stringify(msg));
                
                const targetId = currentTarget < 0 ? -currentTarget : currentTarget;
                if (!messages[targetId]) messages[targetId] = [];
                messages[targetId].push({
                    from: currentUser.id,
                    content: displayContent,
                    file_id: data.data.file_id,
                    file_type: isImage ? 'image' : 'file',
                    time: formatTime(new Date()),
                    self: true
                });
                renderMessages(targetId);
                showToast(isImage ? '图片上传成功' : '文件上传成功');
            } else {
                showToast('上传失败', 'error');
            }
        })
        .catch(() => showToast('上传失败', 'error'));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function downloadFile(fileId) {
    fetch(`${API}/api/download?file_id=${fileId}`)
    .then(r => r.json())
    .then(data => {
        if (data.code === 0 && data.data && data.data.file_data) {
            const byteCharacters = atob(data.data.file_data);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i);
            }
            const blob = new Blob([byteArray]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.data.filename || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            showToast('文件下载失败', 'error');
        }
    })
    .catch(() => showToast('文件下载失败', 'error'));
}

function previewImage(fileId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;';
    overlay.onclick = () => overlay.remove();
    
    const img = document.createElement('img');
    img.src = `${API}/api/download?file_id=${fileId}`;
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;';
    
    overlay.appendChild(img);
    document.body.appendChild(overlay);
}

// ==================== 渲染函数 ====================
function renderConversations() {
    const list = document.getElementById('conv-list');
    const convArray = Object.values(conversations).sort((a, b) => 
        new Date(b.time) - new Date(a.time)
    );
    
    if (convArray.length === 0) {
        list.innerHTML = '<div class="empty-state small">暂无会话</div>';
        return;
    }
    
    list.innerHTML = convArray.map(c => `
        <div class="conversation-item ${currentTarget === c.id ? 'active' : ''}" 
             onclick="startChat(${c.id}, '${c.name}')">
            <div class="avatar" style="background: ${getAvatarColor(c.id)}">${c.name[0]}</div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="last-msg">${c.lastMsg}</div>
            </div>
            <div class="meta">
                <span class="time">${formatTime(c.time)}</span>
                ${c.unread > 0 ? `<span class="unread">${c.unread}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function renderMessages(userId) {
    const list = document.getElementById('msg-list');
    const msgs = messages[userId] || [];
    
    if (msgs.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>暂无消息</p></div>';
        return;
    }
    
    list.innerHTML = msgs.map(m => {
        const isImage = m.content && m.content.startsWith('[图片]');
        const isFile = m.content && m.content.startsWith('[文件]');
        
        let messageContent = '';
        if (isImage && m.file_id) {
            messageContent = `
                <div class="image-message">
                    <img src="${API}/api/download?file_id=${m.file_id}" 
                         alt="图片" 
                         onclick="previewImage(${m.file_id})"
                         loading="lazy">
                    <button class="btn-download" onclick="downloadFile(${m.file_id})">下载</button>
                </div>`;
        } else if (isFile && m.file_id) {
            messageContent = `
                <div class="file-message">
                    <div class="file-icon">📄</div>
                    <div class="file-info">
                        <div class="file-name">${m.content.replace('[文件] ', '').split('(')[0]}</div>
                        <div class="file-size">${m.content.match(/\(([^)]+)\)/)?.[1] || ''}</div>
                    </div>
                    <button class="btn-download" onclick="downloadFile(${m.file_id})">下载</button>
                </div>`;
        } else {
            messageContent = m.content;
        }
        
        const readStatus = m.self ? (m.read ? '<span class="read-status read">已读</span>' : '<span class="read-status">已发送</span>') : '';
        
        return `
        <div class="message-item ${m.self ? 'self' : ''}">
            <div class="avatar">${m.self ? (currentUser.nickname || currentUser.username)[0] : (m.from_name ? m.from_name[0] : 'U')}</div>
            <div class="content">
                ${!m.self && m.from_name ? `<div class="sender-name">${m.from_name}</div>` : ''}
                <div class="bubble">${messageContent}</div>
                <div class="time">${m.time} ${readStatus}</div>
            </div>
        </div>`;
    }).join('');
    
    list.scrollTop = list.scrollHeight;
}

function renderFriends(friends) {
    const list = document.getElementById('friend-items');
    if (!friends || friends.length === 0) {
        list.innerHTML = '<div class="empty-state small">暂无好友</div>';
        return;
    }
    list.innerHTML = friends.map(f => `
        <div class="contact-item" onclick="startChat(${f.id}, '${f.nickname || f.username}')">
            <div class="avatar" style="background: ${getAvatarColor(f.id)}">${(f.nickname || f.username)[0]}</div>
            <span class="name">${f.nickname || f.username}</span>
            <div class="status ${f.online ? 'online' : ''}"></div>
        </div>
    `).join('');
}

function renderGroups() {
    const list = document.getElementById('group-items');
    if (!groups || Object.keys(groups).length === 0) {
        list.innerHTML = '<div class="empty-state small">暂无群组</div>';
        return;
    }
    list.innerHTML = Object.values(groups).map(g => `
        <div class="contact-item" onclick="startGroupChat(${g.id}, '${g.name}')">
            <div class="avatar" style="background: linear-gradient(135deg, #52c41a, #73d13d)">${g.name[0]}</div>
            <span class="name">${g.name}</span>
        </div>
    `).join('');
}

// ==================== 交互函数 ====================
function startNewChat() {
    const userId = parseInt(document.getElementById('new-chat-user').value);
    if (!userId || userId <= 0) { showToast('请输入有效的用户ID', 'error'); return; }
    if (userId === currentUser.id) { showToast('不能和自己聊天', 'error'); return; }
    startChat(userId, '用户' + userId);
    document.getElementById('new-chat-user').value = '';
}

function startChat(userId, userName) {
    currentTarget = userId;
    document.getElementById('chat-target').innerHTML = `<span>${userName}</span>`;
    document.getElementById('msg-input').disabled = false;
    document.getElementById('btn-send').disabled = false;
    
    if (conversations[userId]) conversations[userId].unread = 0;
    if (!messages[userId]) messages[userId] = [];
    renderMessages(userId);
    renderConversations();
}

function startGroupChat(groupId, groupName) {
    currentTarget = -groupId;
    document.getElementById('chat-target').innerHTML = `<span>${groupName}</span> <span style="font-size:12px;color:var(--text3)">(群聊)</span>`;
    document.getElementById('msg-input').disabled = false;
    document.getElementById('btn-send').disabled = false;
    
    if (!messages[groupId]) messages[groupId] = [];
    renderMessages(groupId);
}

function createGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    if (!name) { showToast('请输入群组名称', 'error'); return; }
    
    const groupId = 1000 + Object.keys(groups).length + 1;
    groups[groupId] = { id: groupId, name: name, members: [currentUser.id] };
    renderGroups();
    document.getElementById('new-group-name').value = '';
    showToast('群组 "' + name + '" 创建成功');
}

function filterConversations() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.conversation-item').forEach(item => {
        const name = item.querySelector('.name').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
}

// ==================== 工具函数 ====================
function formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 172800000) return '昨天 ' + date.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
    
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${month}月${day}日 ${hour}:${min}`;
}

function getAvatarColor(id) {
    const colors = [
        'linear-gradient(135deg, #667eea, #764ba2)',
        'linear-gradient(135deg, #f093fb, #f5576c)',
        'linear-gradient(135deg, #4facfe, #00f2fe)',
        'linear-gradient(135deg, #43e97b, #38f9d7)',
        'linear-gradient(135deg, #fa709a, #fee140)',
        'linear-gradient(135deg, #a18cd1, #fbc2eb)'
    ];
    return colors[id % colors.length];
}

// ==================== 主题切换 ====================
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

// ==================== 初始化 ====================
initTheme();

async function loadFriends() {
    try {
        const r = await fetch(`${API}/api/friends?user_id=${currentUser.id}`);
        const data = await r.json();
        if (data.code === 0) renderFriends(data.data);
    } catch (e) {}
}

// 键盘事件
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.id === 'msg-input') {
        e.preventDefault();
        sendMessage();
    }
});

// 自动登录
const saved = sessionStorage.getItem('user');
if (saved) {
    try { currentUser = JSON.parse(saved); enterChat(); }
    catch(e) { showPage('page-login'); }
} else {
    showPage('page-login');
}

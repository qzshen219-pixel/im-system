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
    document.getElementById('userIdDisplay').textContent = 'ID: ' + currentUser.id;
    showPage('page-chat');
    connectWebSocket();
    loadFriends();
    loadPendingFriends();
    loadFolders();
    requestNotificationPermission();
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
        case 'typing': showTypingIndicator(data); break;
        case 'read_receipt': break;
        case 'heartbeat_ack': break;
    }
}

// ==================== 输入状态提示 ====================
let typingTimer = null;

function sendTypingIndicator() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentTarget) return;
    ws.send(JSON.stringify({
        type: 'typing',
        to: currentTarget,
        from: currentUser.id,
        from_name: currentUser.nickname || currentUser.username
    }));
}

function showTypingIndicator(data) {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.textContent = `${data.from_name || '对方'} 正在输入...`;
        indicator.style.display = 'block';
        clearTimeout(indicator._timer);
        indicator._timer = setTimeout(() => { indicator.style.display = 'none'; }, 3000);
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
    if (currentTarget === fromId) {
        renderMessages(fromId);
    } else {
        // 显示浏览器通知
        showToast(`收到来自 ${data.from_name || '用户' + fromId} 的新消息`);
        showBrowserNotification(data.from_name || '用户' + fromId, content);
    }
}

// ==================== 浏览器通知 ====================
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/favicon.ico',
            tag: 'im-notification'
        });
    }
}

function receiveGroupMessage(data) {
    const groupId = data.group_id;
    const content = data.content;
    const time = data.time || new Date().toLocaleTimeString();

    // 忽略自己发送的消息
    if (data.from === currentUser.id) return;

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
        time: new Date().toISOString(),
        self: true
    });
    
    if (!conversations[currentTarget]) {
        conversations[currentTarget] = {
            id: currentTarget,
            name: '用户' + currentTarget,
            lastMsg: content,
            time: new Date().toISOString(),
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
        time: new Date().toISOString(),
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
                    time: new Date().toISOString(),
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

// ==================== 消息撤回 ====================
async function recallMessage(messageId) {
    if (!confirm('确定要撤回这条消息吗？')) return;
    
    try {
        const r = await fetch(`${API}/api/message/recall`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message_id: messageId, user_id: currentUser.id })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('消息已撤回');
            // 更新本地消息
            const userId = currentTarget < 0 ? -currentTarget : currentTarget;
            if (messages[userId]) {
                const msg = messages[userId].find(m => m.id === messageId);
                if (msg) msg.content = '[消息已撤回]';
            }
            renderMessages(userId);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

// ==================== 消息置顶 ====================
function togglePin(messageId) {
    const userId = currentTarget < 0 ? -currentTarget : currentTarget;
    if (!messages[userId]) return;
    
    const msg = messages[userId].find(m => m.id === messageId);
    if (!msg) return;
    
    // 切换置顶状态
    msg.pinned = !msg.pinned;
    
    // 发送到服务器
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'pin',
            msg_id: messageId,
            pinned: msg.pinned
        }));
    }
    
    showToast(msg.pinned ? '消息已置顶' : '取消置顶');
    renderMessages(userId);
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
                    <button class="btn-recall" onclick="moveFileToFolder(${m.file_id})" title="移动到文件夹">📁</button>
                </div>`;
        } else {
            messageContent = m.content;
        }
        
        const readStatus = m.self ? (m.read ? '<span class="read-status read">已读</span>' : '<span class="read-status">已发送</span>') : '';
        const recallBtn = m.self && m.content && !m.content.startsWith('[消息已撤回]') ? 
            `<button class="btn-recall" onclick="recallMessage(${m.id})">撤回</button>` : '';
        const pinBtn = `<button class="btn-pin" onclick="togglePin(${m.id})" title="${m.pinned ? '取消置顶' : '置顶'}">📌</button>`;
        
        return `
        <div class="message-item ${m.self ? 'self' : ''} ${m.pinned ? 'pinned' : ''}">
            <div class="avatar">${m.self ? (currentUser.nickname || currentUser.username)[0] : (m.from_name ? m.from_name[0] : 'U')}</div>
            <div class="content">
                ${!m.self && m.from_name ? `<div class="sender-name">${m.from_name}</div>` : ''}
                <div class="bubble">${messageContent}</div>
                <div class="time">${m.time} ${readStatus} ${recallBtn} ${pinBtn}</div>
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
        <div class="contact-item">
            <div class="avatar" style="background: ${getAvatarColor(f.id)}">${(f.nickname || f.username)[0]}</div>
            <span class="name" onclick="startChat(${f.id}, '${f.nickname || f.username}')">${f.nickname || f.username}</span>
            <div class="status ${f.online ? 'online' : ''}"></div>
            <button class="btn-recall" onclick="event.stopPropagation();removeFriend(${f.id}, '${f.nickname || f.username}')" title="删除">✕</button>
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

// ==================== 好友管理 ====================
async function addFriend() {
    const friendId = parseInt(document.getElementById('add-friend-id').value);
    if (!friendId || friendId <= 0) { showToast('请输入有效的好友ID', 'error'); return; }
    if (friendId === currentUser.id) { showToast('不能添加自己为好友', 'error'); return; }

    try {
        const r = await fetch(`${API}/api/friend/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, friend_id: friendId })
        });
        const data = await r.json();
        showToast(data.code === 0 ? '好友申请已发送' : data.message, data.code === 0 ? 'success' : 'error');
        document.getElementById('add-friend-id').value = '';
    } catch (e) { showToast('网络错误', 'error'); }
}

async function removeFriend(friendId, friendName) {
    if (!confirm(`确定要删除好友 "${friendName}" 吗？`)) return;

    try {
        const r = await fetch(`${API}/api/friend/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, friend_id: friendId })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('好友已删除');
            loadFriends();
            // 如果当前正在与此好友聊天，退出聊天
            if (currentTarget && currentTarget.id === friendId) {
                currentTarget = null;
                document.getElementById('chat-target').innerHTML = '<span>选择会话开始聊天</span>';
                document.getElementById('msg-input').disabled = true;
                document.getElementById('btn-send').disabled = true;
                document.getElementById('msg-list').innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>选择左侧会话开始聊天</p></div>';
            }
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function acceptFriend(friendId) {
    try {
        const r = await fetch(`${API}/api/friend/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, friend_id: friendId })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('已接受好友申请');
            loadFriends();
            loadPendingFriends();
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function loadPendingFriends() {
    try {
        const r = await fetch(`${API}/api/friend/pending?user_id=${currentUser.id}`);
        const data = await r.json();
        if (data.code === 0 && data.data.length > 0) renderPendingFriends(data.data);
        else document.getElementById('pending-section').style.display = 'none';
    } catch (e) {}
}

function renderPendingFriends(friends) {
    const section = document.getElementById('pending-section');
    const list = document.getElementById('pending-items');
    const count = document.getElementById('pending-count');
    section.style.display = 'block';
    count.textContent = `(${friends.length})`;
    list.innerHTML = friends.map(f => `
        <div class="contact-item">
            <div class="avatar" style="background: ${getAvatarColor(f.user_id)}">${(f.nickname || f.username)[0]}</div>
            <span class="name">${f.nickname || f.username}</span>
            <button class="btn-accept" onclick="acceptFriend(${f.user_id})">接受</button>
        </div>
    `).join('');
}

// ==================== 表情选择器 ====================
function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function insertEmoji(emoji) {
    const input = document.getElementById('msg-input');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
    document.getElementById('emoji-picker').style.display = 'none';
}

// ==================== 消息搜索 ====================
function searchMessages() {
    const query = document.getElementById('msgSearch').value.toLowerCase();
    const userId = currentTarget < 0 ? -currentTarget : currentTarget;
    const msgs = messages[userId] || [];
    if (!query) { renderMessages(userId); return; }
    const filtered = msgs.filter(m => m.content && m.content.toLowerCase().includes(query));
    renderFilteredMessages(filtered);
}

function renderFilteredMessages(msgs) {
    const list = document.getElementById('msg-list');
    if (msgs.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>未找到匹配的消息</p></div>';
        return;
    }
    list.innerHTML = msgs.map(m => `
        <div class="message-item ${m.self ? 'self' : ''}">
            <div class="avatar">${m.self ? (currentUser.nickname || currentUser.username)[0] : (m.from_name ? m.from_name[0] : 'U')}</div>
            <div class="content">
                ${!m.self && m.from_name ? `<div class="sender-name">${m.from_name}</div>` : ''}
                <div class="bubble">${m.content}</div>
                <div class="time">${m.time}</div>
            </div>
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
    renderConversations();
    
    // 从服务器加载历史消息
    loadMessageHistory(userId);
}

async function loadMessageHistory(userId) {
    try {
        const r = await fetch(`${API}/api/messages/history?user_id=${currentUser.id}&target_id=${userId}`);
        const data = await r.json();
        if (data.code === 0) {
            messages[userId] = data.data.map(m => ({
                id: m.id,
                from: m.from,
                content: m.content,
                file_id: m.file_id || null,
                time: m.time,
                self: m.from === currentUser.id,
                from_name: m.from_name
            }));
            renderMessages(userId);
        }
    } catch (e) {
        console.error('加载历史消息失败:', e);
        if (!messages[userId]) messages[userId] = [];
        renderMessages(userId);
    }
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

// ==================== 文件夹管理 ====================
let folders = {};

async function loadFolders() {
    try {
        const r = await fetch(`${API}/api/folder/list?user_id=${currentUser.id}`);
        const data = await r.json();
        if (data.code === 0) {
            folders = {};
            data.data.forEach(f => { folders[f.id] = f; });
            renderFolders();
        }
    } catch (e) {}
}

async function createFolder() {
    const name = document.getElementById('new-folder-name').value.trim();
    if (!name) { showToast('请输入文件夹名称', 'error'); return; }
    
    try {
        const r = await fetch(`${API}/api/folder/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, name: name })
        });
        const data = await r.json();
        if (data.code === 0) {
            folders[data.data.id] = data.data;
            renderFolders();
            document.getElementById('new-folder-name').value = '';
            showToast('文件夹创建成功');
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function deleteFolder(folderId) {
    if (!confirm('确定删除此文件夹？')) return;
    
    try {
        const r = await fetch(`${API}/api/folder/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: folderId, user_id: currentUser.id })
        });
        const data = await r.json();
        if (data.code === 0) {
            delete folders[folderId];
            renderFolders();
            showToast('文件夹已删除');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

function renderFolders() {
    const list = document.getElementById('folder-items');
    if (!list) return;
    
    const folderArray = Object.values(folders);
    if (folderArray.length === 0) {
        list.innerHTML = '<div class="empty-state small">暂无文件夹</div>';
        return;
    }
    list.innerHTML = folderArray.map(f => `
        <div class="contact-item" onclick="openFolder(${f.id}, '${f.name}')">
            <div class="avatar" style="background: linear-gradient(135deg, #faad14, #fa8c16)">📁</div>
            <span class="name">${f.name}</span>
            <button class="btn-recall" onclick="event.stopPropagation();deleteFolder(${f.id})" title="删除">✕</button>
        </div>
    `).join('');
}

async function openFolder(folderId, folderName) {
    try {
        const r = await fetch(`${API}/api/file/by_folder?folder_id=${folderId}`);
        const data = await r.json();
        if (data.code === 0) {
            showFolderDialog(folderName, data.data, folderId);
        }
    } catch (e) { showToast('加载失败', 'error'); }
}

function showFolderDialog(name, files, folderId) {
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.innerHTML = `
        <div class="dialog" style="max-width:500px">
            <h3 data-folder-id="${folderId}">📁 ${name}</h3>
            <div id="folder-files">
                ${files.length === 0 ? '<div class="empty-state small">暂无文件</div>' : 
                    files.map(f => `
                        <div class="contact-item">
                            <span class="name">📄 ${f.filename}</span>
                            <span style="color:var(--text3);font-size:12px;margin-left:auto">${(f.size/1024).toFixed(1)}KB</span>
                            <button class="btn-recall" onclick="downloadFile(${f.id})">下载</button>
                        </div>
                    `).join('')}
            </div>
            <div class="dialog-actions">
                <button class="dialog-cancel" onclick="this.closest('.dialog-overlay').remove()">关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
}

function moveFileToFolder(fileId) {
    // 显示文件夹选择对话框
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    
    const folderArray = Object.values(folders);
    if (folderArray.length === 0) {
        dialog.innerHTML = `
            <div class="dialog" style="max-width:400px">
                <h3>移动到文件夹</h3>
                <div class="empty-state small">暂无文件夹，请先创建文件夹</div>
                <div class="dialog-actions">
                    <button class="dialog-cancel" onclick="this.closest('.dialog-overlay').remove()">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
        return;
    }
    
    dialog.innerHTML = `
        <div class="dialog" style="max-width:400px">
            <h3>移动到文件夹</h3>
            <div class="folder-select-list">
                ${folderArray.map(f => `
                    <div class="contact-item" onclick="confirmMoveFile(${fileId}, ${f.id}, '${f.name}')">
                        <div class="avatar" style="background: linear-gradient(135deg, #faad14, #fa8c16)">📁</div>
                        <span class="name">${f.name}</span>
                    </div>
                `).join('')}
            </div>
            <div class="dialog-actions">
                <button class="dialog-cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
}

function confirmMoveFile(fileId, folderId, folderName) {
    // 关闭选择对话框
    document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());
    
    fetch(`${API}/api/file/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId, folder_id: folderId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.code === 0) {
            showToast(`文件已移动到文件夹: ${folderName}`);
            // 如果当前有打开的文件夹对话框，刷新内容
            const folderDialog = document.querySelector('.dialog-overlay .dialog h3');
            if (folderDialog && folderDialog.textContent.includes('📁')) {
                // 找到当前打开的文件夹ID并刷新
                const currentFolderId = parseInt(folderDialog.getAttribute('data-folder-id'));
                if (!isNaN(currentFolderId)) {
                    openFolder(currentFolderId, folderName);
                }
            }
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(() => showToast('操作失败', 'error'));
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

// ==================== 用户资料 ====================
async function showProfile() {
    try {
        const r = await fetch(`${API}/api/user/profile?user_id=${currentUser.id}`);
        const data = await r.json();
        if (data.code === 0) showProfileDialog(data.data);
    } catch (e) { showToast('网络错误', 'error'); }
}

function showProfileDialog(profile) {
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.innerHTML = `
        <div class="dialog">
            <h3>个人资料</h3>
            <div class="form-group">
                <label>用户名</label>
                <input type="text" value="${profile.username}" disabled style="opacity:0.6">
            </div>
            <div class="form-group">
                <label>昵称</label>
                <input type="text" id="profile-nickname" value="${profile.nickname || ''}" placeholder="设置昵称">
            </div>
            <div class="form-group">
                <label>邮箱</label>
                <input type="email" id="profile-email" value="${profile.email || ''}" placeholder="设置邮箱">
            </div>
            <div class="form-group">
                <label>手机</label>
                <input type="text" id="profile-phone" value="${profile.phone || ''}" placeholder="设置手机">
            </div>
            <div class="dialog-actions">
                <button class="dialog-cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
                <button class="dialog-save" onclick="updateProfile()">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
}

async function updateProfile() {
    const nickname = document.getElementById('profile-nickname').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    
    try {
        const r = await fetch(`${API}/api/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, nickname, email, phone })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('资料更新成功');
            currentUser.nickname = nickname;
            document.getElementById('current-user').textContent = nickname || currentUser.username;
            document.getElementById('currentAvatar').textContent = (nickname || currentUser.username)[0];
            document.querySelector('.dialog-overlay').remove();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
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

// ==================== 快捷键 ====================
document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' && !e.shiftKey && document.activeElement?.id === 'msg-input') ||
        (e.key === 'Enter' && e.ctrlKey && document.activeElement?.id === 'msg-input')) {
        e.preventDefault(); sendMessage();
    }
    if (e.key === 'Escape') {
        const d = document.querySelector('.dialog-overlay'); if (d) { d.remove(); return; }
        const em = document.getElementById('emoji-picker'); if (em && em.style.display !== 'none') { em.style.display = 'none'; return; }
        if (currentTarget) {
            currentTarget = null;
            document.getElementById('chat-target').innerHTML = '<span>选择会话开始聊天</span>';
            document.getElementById('msg-input').disabled = true;
            document.getElementById('btn-send').disabled = true;
            document.getElementById('msg-list').innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>选择左侧会话开始聊天</p></div>';
        }
    }
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); document.getElementById('searchInput')?.focus(); }
    if (e.ctrlKey && e.key === '/') { e.preventDefault(); document.getElementById('msg-input')?.focus(); }
});

// 输入事件 - 发送正在输入状态
document.addEventListener('input', e => {
    if (e.target.id === 'msg-input') {
        clearTimeout(typingTimer);
        sendTypingIndicator();
        typingTimer = setTimeout(() => {}, 2000);
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

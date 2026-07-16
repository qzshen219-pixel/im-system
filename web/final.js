const API = window.location.protocol + '//' + window.location.hostname + ':8080';
let currentUser = null;
let ws = null;
let currentTarget = null;
let conversations = {};
let messages = {};
let groups = {};
let searchTimer = null;
let unreadCounts = {};

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

    // 显示头像
    const avatarEl = document.getElementById('currentAvatar');
    if (currentUser.avatar_id && currentUser.avatar_id > 0) {
        // 使用base64数据直接显示
        fetch(`${API}/api/download?file_id=${currentUser.avatar_id}`)
            .then(r => r.json())
            .then(data => {
                if (data.code === 0 && data.data && data.data.file_data) {
                    avatarEl.innerHTML = `<img src="data:image/jpeg;base64,${data.data.file_data}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                }
            })
            .catch(() => {});
    } else {
        avatarEl.textContent = (currentUser.nickname || currentUser.username)[0];
    }

    document.getElementById('userIdDisplay').textContent = 'ID: ' + currentUser.id;
    showPage('page-chat');
    connectWebSocket();
    loadFriends();
    loadPendingFriends();
    loadFolders();
    loadGroups();
    requestNotificationPermission();
}

// ==================== WebSocket ====================
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;
const BASE_DELAY = 1000;

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    
    const wsUrl = `ws://${window.location.hostname}:8001`;
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
        case 'status_change': handleStatusChange(data); break;
        case 'read_receipt': break;
        case 'heartbeat_ack': break;
    }
}

function handleStatusChange(data) {
    const userId = data.user_id;
    const online = data.online;

    // 获取用户名称
    let userName = '用户' + userId;
    if (conversations[userId]) {
        userName = conversations[userId].name;
        conversations[userId].online = online;
        renderConversations();
    }

    // 显示通知
    showToast(`${userName} ${online ? '上线了' : '下线了'}`, online ? 'success' : 'info');
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
        // 增加未读计数
        addUnreadCount(fromId);
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

    // 添加到会话列表
    const groupName = groups[groupId] ? groups[groupId].name : '群组' + groupId;
    conversations['group_' + groupId] = {
        id: 'group_' + groupId,
        groupId: groupId,
        name: groupName,
        lastMsg: content,
        time: time,
        isGroup: true
    };

    if (currentTarget === -groupId) {
        renderMessages(groupId);
    } else {
        addUnreadCount('group_' + groupId);
        showToast(`收到来自群组的新消息`);
    }
    renderConversations();
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
        conversations[currentTarget].time = new Date().toISOString();
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

    // 添加到会话列表
    const groupName = groups[groupId] ? groups[groupId].name : '群组' + groupId;
    conversations['group_' + groupId] = {
        id: 'group_' + groupId,
        groupId: groupId,
        name: groupName,
        lastMsg: content,
        time: new Date().toISOString(),
        isGroup: true
    };

    renderMessages(groupId);
    renderConversations();
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

// ==================== 语音消息 ====================
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let shouldSendVoice = false;

function toggleVoiceRecording() {
    if (!currentTarget) { showToast('请先选择聊天对象', 'error'); return; }

    // 检查浏览器是否支持
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('浏览器不支持录音功能（需要HTTPS）', 'error');
        return;
    }

    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!currentTarget) { showToast('请先选择聊天对象', 'error'); return; }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            isRecording = true;
            shouldSendVoice = true;
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (shouldSendVoice) sendVoiceMessage();
                shouldSendVoice = false;
            };
            mediaRecorder.start();
            document.getElementById('voiceBtn').style.background = 'var(--red)';
            document.getElementById('voiceBtn').style.color = '#fff';
            showToast('正在录音，再次点击发送');
        })
        .catch(() => showToast('无法访问麦克风', 'error'));
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        isRecording = false;
        mediaRecorder.stop();
        document.getElementById('voiceBtn').style.background = '';
        document.getElementById('voiceBtn').style.color = '';
    }
}

function cancelRecording() {
    if (mediaRecorder && isRecording) {
        isRecording = false;
        shouldSendVoice = false;
        mediaRecorder.stop();
        audioChunks = [];
        document.getElementById('voiceBtn').style.background = '';
        document.getElementById('voiceBtn').style.color = '';
        showToast('录音已取消');
    }
}

async function sendVoiceMessage() {
    if (audioChunks.length === 0) return;

    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const displayContent = '[语音] ' + Math.round(blob.size / 1024) + 'KB';

        // 上传语音文件
        try {
            const r = await fetch(`${API}/api/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'voice_' + Date.now() + '.webm',
                    file_data: base64,
                    from_user_id: currentUser.id,
                    to_user_id: currentTarget < 0 ? 0 : currentTarget
                })
            });
            const data = await r.json();
            if (data.code === 0) {
                const msg = {
                    type: 'chat',
                    to: currentTarget,
                    content: displayContent,
                    msg_type: 5,
                    file_id: data.data.file_id
                };
                ws.send(JSON.stringify(msg));

                if (!messages[currentTarget]) messages[currentTarget] = [];
                messages[currentTarget].push({
                    from: currentUser.id,
                    content: displayContent,
                    file_id: data.data.file_id,
                    time: new Date().toISOString(),
                    self: true
                });
                renderMessages(currentTarget);
                showToast('语音发送成功');
            }
        } catch (e) { showToast('语音发送失败', 'error'); }
    };
    reader.readAsDataURL(blob);
}

// ==================== 视频消息 ====================
let videoRecorder = null;
let videoChunks = [];
let isRecordingVideo = false;
let videoStream = null;
let shouldSendVideo = false;

function toggleVideoRecording() {
    if (!currentTarget) { showToast('请先选择聊天对象', 'error'); return; }

    // 检查浏览器是否支持
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('浏览器不支持录像功能（需要HTTPS）', 'error');
        return;
    }

    if (isRecordingVideo) {
        stopVideoRecording();
    } else {
        startVideoRecording();
    }
}

function startVideoRecording() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            isRecordingVideo = true;
            shouldSendVideo = true;
            videoChunks = [];
            videoStream = stream;
            videoRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            videoRecorder.ondataavailable = e => videoChunks.push(e.data);
            videoRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (shouldSendVideo) sendVideoMessage();
                shouldSendVideo = false;
            };
            videoRecorder.start();
            document.getElementById('videoBtn').style.background = 'var(--red)';
            document.getElementById('videoBtn').style.color = '#fff';
            showToast('正在录制视频，再次点击发送');
        })
        .catch(() => showToast('无法访问摄像头', 'error'));
}

function stopVideoRecording() {
    if (videoRecorder && isRecordingVideo) {
        isRecordingVideo = false;
        videoRecorder.stop();
        document.getElementById('videoBtn').style.background = '';
        document.getElementById('videoBtn').style.color = '';
    }
}

async function sendVideoMessage() {
    if (videoChunks.length === 0) return;

    const blob = new Blob(videoChunks, { type: 'video/webm' });
    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const displayContent = '[视频] ' + Math.round(blob.size / 1024) + 'KB';

        try {
            const r = await fetch(`${API}/api/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'video_' + Date.now() + '.webm',
                    file_data: base64,
                    from_user_id: currentUser.id,
                    to_user_id: currentTarget < 0 ? 0 : currentTarget
                })
            });
            const data = await r.json();
            if (data.code === 0) {
                const msg = {
                    type: 'chat',
                    to: currentTarget,
                    content: displayContent,
                    msg_type: 6,
                    file_id: data.data.file_id
                };
                ws.send(JSON.stringify(msg));

                if (!messages[currentTarget]) messages[currentTarget] = [];
                messages[currentTarget].push({
                    from: currentUser.id,
                    content: displayContent,
                    file_id: data.data.file_id,
                    time: new Date().toISOString(),
                    self: true
                });
                renderMessages(currentTarget);
                showToast('视频发送成功');
            }
        } catch (e) { showToast('视频发送失败', 'error'); }
    };
    reader.readAsDataURL(blob);
}

function previewFile(fileId, filename) {
    // 获取文件扩展名
    const ext = filename.split('.').pop().toLowerCase();
    console.log('previewFile:', fileId, filename, ext);

    // 支持预览的文件类型
    const previewableTypes = ['pdf', 'txt', 'md', 'html', 'htm', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];

    if (!previewableTypes.includes(ext)) {
        showToast('此文件类型不支持预览，请下载查看', 'error');
        return;
    }

    // 获取文件数据
    fetch(`${API}/api/download?file_id=${fileId}`)
        .then(r => r.json())
        .then(data => {
            if (data.code === 0 && data.data && data.data.file_data) {
                const base64 = data.data.file_data;
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;';

                let content = '';

                if (ext === 'pdf') {
                    content = `<iframe src="data:application/pdf;base64,${base64}" style="width:80%;height:80%;border:none;border-radius:8px;"></iframe>`;
                } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(ext)) {
                    content = `<img src="data:image/${ext};base64,${base64}" style="max-width:90%;max-height:80%;border-radius:8px;">`;
                } else if (['txt', 'md'].includes(ext)) {
                    const text = atob(base64);
                    content = `<pre style="background:var(--bg);color:var(--text);padding:20px;border-radius:8px;max-width:80%;max-height:80%;overflow:auto;white-space:pre-wrap;">${text}</pre>`;
                } else if (['html', 'htm'].includes(ext)) {
                    content = `<iframe src="data:text/html;base64,${base64}" style="width:80%;height:80%;border:none;border-radius:8px;background:white;"></iframe>`;
                }

                overlay.innerHTML = `
                    <div style="position:absolute;top:20px;right:20px;display:flex;gap:10px;">
                        <button onclick="downloadFile(${fileId})" style="padding:8px 16px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;">下载</button>
                        <button onclick="this.closest('div[style]').parentElement.remove()" style="padding:8px 16px;background:#666;color:white;border:none;border-radius:4px;cursor:pointer;">关闭</button>
                    </div>
                    <div style="font-size:14px;color:white;margin-bottom:10px;">${filename}</div>
                    ${content}
                `;

                overlay.addEventListener('click', e => {
                    if (e.target === overlay) overlay.remove();
                });

                document.body.appendChild(overlay);
            }
        })
        .catch(() => showToast('文件预览失败', 'error'));
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

function loadMessageImage(fileId) {
    if (avatarCache['img_' + fileId]) {
        const img = document.getElementById(`img-${fileId}`);
        if (img) img.src = avatarCache['img_' + fileId];
        return;
    }
    fetch(`${API}/api/download?file_id=${fileId}`)
        .then(r => r.json())
        .then(data => {
            if (data.code === 0 && data.data && data.data.file_data) {
                const base64 = 'data:image/jpeg;base64,' + data.data.file_data;
                avatarCache['img_' + fileId] = base64;
                const img = document.getElementById(`img-${fileId}`);
                if (img) img.src = base64;
            }
        })
        .catch(() => {});
}

function previewImage(fileId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;';
    overlay.onclick = () => overlay.remove();

    const img = document.createElement('img');
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;';

    // 使用缓存的图片数据
    if (avatarCache['img_' + fileId]) {
        img.src = avatarCache['img_' + fileId];
    } else {
        fetch(`${API}/api/download?file_id=${fileId}`)
            .then(r => r.json())
            .then(data => {
                if (data.code === 0 && data.data && data.data.file_data) {
                    img.src = 'data:image/jpeg;base64,' + data.data.file_data;
                }
            });
    }

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

// ==================== 消息转发 ====================
function forwardMessage(messageId) {
    const friendArray = Object.values(conversations);
    if (friendArray.length === 0) {
        showToast('暂无会话，无法转发', 'error');
        return;
    }

    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.innerHTML = `
        <div class="dialog" style="max-width:400px">
            <h3>转发消息</h3>
            <div class="forward-list">
                ${friendArray.map(f => `
                    <div class="contact-item" onclick="confirmForward(${messageId}, ${f.id}, '${f.name}')">
                        <div class="avatar" style="background: ${getAvatarColor(f.id)}">${f.name[0]}</div>
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

async function confirmForward(messageId, toUserId, toUserName) {
    document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());

    try {
        const r = await fetch(`${API}/api/message/forward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msg_id: messageId, to_user_id: toUserId, from_user_id: currentUser.id })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast(`消息已转发给 ${toUserName}`);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

// ==================== 未读消息数 ====================
function addUnreadCount(userId) {
    if (!unreadCounts[userId]) unreadCounts[userId] = 0;
    unreadCounts[userId]++;
    updateUnreadBadge(userId);
}

function clearUnreadCount(userId) {
    unreadCounts[userId] = 0;
    updateUnreadBadge(userId);
}

function updateUnreadBadge(userId) {
    const count = unreadCounts[userId] || 0;
    const badge = document.querySelector(`[data-user-id="${userId}"] .unread-badge`);
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ==================== 消息回复 ====================
function replyMessage(messageId) {
    // 查找消息获取发送者名称
    let senderName = '';
    for (const msgs of Object.values(messages)) {
        const msg = msgs.find(m => m.id === messageId);
        if (msg) {
            senderName = msg.from_name || '用户';
            break;
        }
    }

    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.innerHTML = `
        <div class="dialog" style="max-width:400px">
            <h3>回复 ${senderName}</h3>
            <div class="form-group">
                <textarea id="reply-content" rows="3" placeholder="输入回复内容..."></textarea>
            </div>
            <div class="dialog-actions">
                <button class="dialog-cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
                <button class="dialog-confirm" onclick="confirmReply(${messageId})">发送</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
    document.getElementById('reply-content').focus();
}

async function confirmReply(messageId) {
    const content = document.getElementById('reply-content').value.trim();
    if (!content) { showToast('请输入回复内容', 'error'); return; }

    document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());

    if (!currentTarget) { showToast('请选择会话', 'error'); return; }

    try {
        const r = await fetch(`${API}/api/message/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reply_to_msg_id: messageId,
                from_user_id: currentUser.id,
                to_user_id: currentTarget,
                content: content
            })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('回复已发送');
            // 刷新消息列表
            loadMessageHistory(currentTarget);
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

    list.innerHTML = convArray.map(c => {
        const unread = unreadCounts[c.id] || 0;
        const isGroup = c.isGroup;
        const clickAction = isGroup
            ? `startGroupChat(${c.groupId}, '${c.name}')`
            : `startChat(${c.id}, '${c.name}')`;
        return `
        <div class="conversation-item ${currentTarget === (isGroup ? -c.groupId : c.id) ? 'active' : ''}"
             data-user-id="${c.id}"
             onclick="${clickAction}">
            <div class="avatar" style="background: ${isGroup ? 'linear-gradient(135deg, #52c41a, #73d13d)' : getAvatarColor(c.id)}">${c.name[0]}</div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="last-msg">${c.lastMsg}</div>
            </div>
            <div class="meta">
                <span class="time">${formatTime(c.time)}</span>
                ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
            </div>
        </div>`;
    }).join('');
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
        const isVoice = m.content && m.content.startsWith('[语音]');
        const isVideo = m.content && m.content.startsWith('[视频]');

        let messageContent = '';
        if (isVideo && m.file_id) {
            messageContent = `
                <div class="video-message">
                    <video controls src="${API}/api/download?file_id=${m.file_id}" style="max-width:300px;border-radius:8px;"></video>
                    <button class="btn-download" onclick="downloadFile(${m.file_id})" style="margin-top:4px">下载</button>
                </div>`;
        } else if (isVoice && m.file_id) {
            messageContent = `
                <div class="voice-message">
                    <audio controls src="${API}/api/download?file_id=${m.file_id}" style="max-width:200px;"></audio>
                    <span style="margin-left:8px;font-size:12px;color:var(--text3)">${m.content}</span>
                </div>`;
        } else if (isImage && m.file_id) {
            messageContent = `
                <div class="image-message">
                    <img src="" 
                         id="img-${m.file_id}"
                         alt="图片" 
                         onclick="previewImage(${m.file_id})"
                         loading="lazy"
                         style="cursor:pointer;max-width:300px;border-radius:8px;min-height:50px;background:var(--bg);">
                    <button class="btn-download" onclick="downloadFile(${m.file_id})">下载</button>
                </div>`;
            // 使用Promise确保DOM渲染后加载图片
            Promise.resolve().then(() => loadMessageImage(m.file_id));
        } else if (isFile && m.file_id) {
            const fileName = m.content.replace('[文件] ', '').split('(')[0].trim();
            messageContent = `
                <div class="file-message">
                    <div class="file-icon">📄</div>
                    <div class="file-info">
                        <div class="file-name">${fileName}</div>
                        <div class="file-size">${m.content.match(/\(([^)]+)\)/)?.[1] || ''}</div>
                    </div>
                    <button class="btn-download" onclick="previewFile(${m.file_id}, '${fileName}')">预览</button>
                    <button class="btn-download" onclick="downloadFile(${m.file_id})">下载</button>
                    <button class="btn-recall" onclick="moveFileToFolder(${m.file_id})" title="移动到文件夹">📁</button>
                </div>`;
        } else {
            messageContent = m.content;
        }
        
        const readStatus = m.self ? (m.read ? '<span class="read-status read">已读</span>' : '<span class="read-status">已发送</span>') : '';

        // 检查消息是否在2分钟内（可以撤回）
        const msgTime = new Date(m.time);
        const now = new Date();
        const canRecall = m.self && m.content && !m.content.startsWith('[消息已撤回]') && (now - msgTime) < 120000;

        const recallBtn = canRecall ?
            `<button class="btn-recall" onclick="recallMessage(${m.id})">撤回</button>` : '';
        const forwardBtn = m.content && !m.content.startsWith('[消息已撤回]') ?
            `<button class="btn-recall" onclick="forwardMessage(${m.id})">转发</button>` : '';
        const replyBtn = !m.self && m.content && !m.content.startsWith('[消息已撤回]') ?
            `<button class="btn-recall" onclick="replyMessage(${m.id})">回复</button>` : '';
        const pinBtn = `<button class="btn-pin" onclick="togglePin(${m.id})" title="${m.pinned ? '取消置顶' : '置顶'}">📌</button>`;
        
        return `
        <div class="message-item ${m.self ? 'self' : ''} ${m.pinned ? 'pinned' : ''}">
            <div class="avatar">${m.self ? (currentUser.nickname || currentUser.username)[0] : (m.from_name ? m.from_name[0] : 'U')}</div>
            <div class="content">
                ${!m.self && m.from_name ? `<div class="sender-name">${m.from_name}</div>` : ''}
                <div class="bubble">${messageContent}</div>
                <div class="time">${m.time} ${readStatus} ${recallBtn} ${forwardBtn} ${replyBtn} ${pinBtn}</div>
            </div>
        </div>`;
    }).join('');
}

let avatarCache = {};

function renderFriends(friends) {
    const list = document.getElementById('friend-items');
    if (!friends || friends.length === 0) {
        list.innerHTML = '<div class="empty-state small">暂无好友</div>';
        return;
    }
    list.innerHTML = friends.map(f => `
        <div class="contact-item">
            <div class="avatar" style="background: ${getAvatarColor(f.id)}" id="avatar-friend-${f.id}">${(f.nickname || f.username)[0]}</div>
            <span class="name" onclick="startChat(${f.id}, '${f.nickname || f.username}')">${f.nickname || f.username}</span>
            <div class="status ${f.online ? 'online' : ''}"></div>
            <button class="btn-recall" onclick="event.stopPropagation();removeFriend(${f.id}, '${f.nickname || f.username}')" title="删除">✕</button>
        </div>
    `).join('');

    // 异步加载头像
    friends.forEach(f => {
        if (f.avatar_id && f.avatar_id > 0) {
            loadFriendAvatar(f.id, f.avatar_id);
        }
    });
}

function loadFriendAvatar(userId, avatarId) {
    if (avatarCache[avatarId]) {
        applyAvatar(userId, avatarCache[avatarId]);
        return;
    }
    fetch(`${API}/api/download?file_id=${avatarId}`)
        .then(r => r.json())
        .then(data => {
            if (data.code === 0 && data.data && data.data.file_data) {
                avatarCache[avatarId] = data.data.file_data;
                applyAvatar(userId, data.data.file_data);
            }
        })
        .catch(() => {});
}

function applyAvatar(userId, base64Data) {
    const avatarEl = document.getElementById(`avatar-friend-${userId}`);
    if (avatarEl) {
        avatarEl.innerHTML = `<img src="data:image/jpeg;base64,${base64Data}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
}

function getAvatarBase64(avatarId) {
    // 返回一个占位符，实际图片异步加载
    return '';
}

function renderGroups() {
    const list = document.getElementById('group-items');
    if (!groups || Object.keys(groups).length === 0) {
        list.innerHTML = '<div class="empty-state small">暂无群组</div>';
        return;
    }
    list.innerHTML = Object.values(groups).map(g => `
        <div class="contact-item">
            <div class="avatar" style="background: linear-gradient(135deg, #52c41a, #73d13d)">${g.name[0]}</div>
            <div class="info">
                <span class="name" onclick="startGroupChat(${g.id}, '${g.name}')">${g.name}</span>
                <span class="group-id">ID: ${g.id}</span>
            </div>
            <button class="btn-recall" onclick="event.stopPropagation();leaveGroup(${g.id}, '${g.name}')" title="退出群组">✕</button>
        </div>
    `).join('');

    // 显示提示信息
    const ids = Object.values(groups).map(g => g.id).join(', ');
    showToast(`你的群组ID: ${ids}`, 'info');
}

// ==================== 群组管理 ====================
async function loadGroups() {
    try {
        const r = await fetch(`${API}/api/group/list?user_id=${currentUser.id}`);
        const data = await r.json();
        if (data.code === 0) {
            groups = {};
            data.data.forEach(g => { groups[g.id] = g; });
            renderGroups();
        }
    } catch (e) {}
}

async function createGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    if (!name) { showToast('请输入群组名称', 'error'); return; }

    try {
        const r = await fetch(`${API}/api/group/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, name: name })
        });
        const data = await r.json();
        if (data.code === 0) {
            groups[data.data.id] = data.data;
            renderGroups();
            document.getElementById('new-group-name').value = '';
            showToast('群组创建成功，ID: ' + data.data.id);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function joinGroup() {
    const groupId = parseInt(document.getElementById('group-id').value);
    if (!groupId || groupId <= 0) { showToast('请输入有效的群组ID', 'error'); return; }

    try {
        const r = await fetch(`${API}/api/group/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, group_id: groupId })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('已加入群组');
            loadGroups();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function leaveGroup(groupId, groupName) {
    if (!confirm(`确定要退出群组 "${groupName}" 吗？`)) return;

    try {
        const r = await fetch(`${API}/api/group/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, group_id: -groupId })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('已退出群组');
            loadGroups();
            if (currentTarget && currentTarget.id === groupId && currentTarget.isGroup) {
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

    // 清除未读计数
    clearUnreadCount(userId);
    renderConversations();

    // 从服务器加载历史消息
    loadMessageHistory(userId);
}

let messageOffset = {};
let messageLoading = {};

async function loadMessageHistory(userId, loadMore = false) {
    if (messageLoading[userId]) return;
    messageLoading[userId] = true;

    try {
        if (!loadMore) messageOffset[userId] = 0;
        const offset = messageOffset[userId] || 0;

        const r = await fetch(`${API}/api/messages/history?user_id=${currentUser.id}&target_id=${userId}&limit=50&offset=${offset}`);
        const data = await r.json();
        if (data.code === 0) {
            const newMessages = data.data.map(m => ({
                id: m.id,
                from: m.from,
                content: m.content,
                file_id: m.file_id || null,
                read: m.status === 1,
                time: m.time,
                self: m.from === currentUser.id,
                from_name: m.from_name
            })).reverse();

            if (loadMore && messages[userId]) {
                messages[userId] = [...newMessages, ...messages[userId]];
            } else {
                messages[userId] = newMessages;
            }

            messageOffset[userId] = offset + 50;
            renderMessages(userId);

            // 首次加载时滚动到底部显示最新消息
            if (!loadMore) {
                setTimeout(() => {
                    const list = document.getElementById('msg-list');
                    if (list) list.scrollTop = list.scrollHeight;
                }, 50);
            }
        }
    } catch (e) {
        console.error('加载历史消息失败:', e);
        if (!messages[userId]) messages[userId] = [];
        renderMessages(userId);
    } finally {
        messageLoading[userId] = false;
    }
}

async function markAsRead(fromUserId) {
    try {
        await fetch(`${API}/api/message/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, from_user_id: fromUserId })
        });
    } catch (e) {}
}

function startGroupChat(groupId, groupName) {
    currentTarget = -groupId;

    // 获取群公告
    const groupData = groups[groupId];
    const announcement = groupData ? groupData.announcement : '';
    const isOwner = groupData && groupData.owner_id === currentUser.id;

    let headerHTML = `<span>${groupName}</span> <span style="font-size:12px;color:var(--text3)">(群聊)</span>`;
    headerHTML += ` <button class="btn-recall" onclick="showGroupMembers(${groupId})" style="margin-left:8px;font-size:11px">成员</button>`;
    if (isOwner) {
        headerHTML += ` <button class="btn-recall" onclick="editAnnouncement(${groupId})" style="font-size:11px">公告</button>`;
    }

    document.getElementById('chat-target').innerHTML = headerHTML;

    // 显示群公告
    if (announcement) {
        document.getElementById('chat-target').innerHTML += `<div style="font-size:11px;color:var(--text3);margin-top:4px;padding:4px 8px;background:var(--bg);border-radius:4px;">📢 ${announcement}</div>`;
    }

    document.getElementById('msg-input').disabled = false;
    document.getElementById('btn-send').disabled = false;

    // 添加到会话列表
    if (!conversations['group_' + groupId]) {
        conversations['group_' + groupId] = {
            id: 'group_' + groupId,
            groupId: groupId,
            name: groupName,
            lastMsg: '',
            time: new Date().toISOString(),
            isGroup: true
        };
    }
    renderConversations();

    // 从服务器加载群组历史消息
    loadGroupMessages(groupId);
}

function editAnnouncement(groupId) {
    const groupData = groups[groupId];
    const currentAnnouncement = groupData ? groupData.announcement || '' : '';

    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.innerHTML = `
        <div class="dialog" style="max-width:400px">
            <h3>设置群公告</h3>
            <div class="form-group">
                <textarea id="announcement-text" rows="3" placeholder="输入群公告内容">${currentAnnouncement}</textarea>
            </div>
            <div class="dialog-actions">
                <button class="dialog-cancel" onclick="this.closest('.dialog-overlay').remove()">取消</button>
                <button class="dialog-confirm" onclick="saveAnnouncement(${groupId})">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
}

async function saveAnnouncement(groupId) {
    const announcement = document.getElementById('announcement-text').value.trim();

    try {
        const r = await fetch(`${API}/api/group/announcement`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId, user_id: currentUser.id, announcement: announcement })
        });
        const data = await r.json();
        if (data.code === 0) {
            // 更新本地群组数据
            if (groups[groupId]) {
                groups[groupId].announcement = announcement;
            }
            showToast('群公告已更新');
            document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());
            // 刷新群聊界面
            startGroupChat(groupId, groups[groupId] ? groups[groupId].name : '群组');
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function showGroupMembers(groupId) {
    try {
        const r = await fetch(`${API}/api/group/members?group_id=${groupId}`);
        const data = await r.json();
        if (data.code === 0) {
            // 检查当前用户是否是群主
            const isOwner = data.data.some(m => m.id === currentUser.id && m.role === 1);

            const dialog = document.createElement('div');
            dialog.className = 'dialog-overlay';
            dialog.innerHTML = `
                <div class="dialog" style="max-width:400px">
                    <h3>群组成员 (${data.data.length}人)</h3>
                    <div class="member-list">
                        ${data.data.map(m => `
                            <div class="contact-item">
                                <div class="avatar" style="background: ${getAvatarColor(m.id)}">${(m.nickname || m.username)[0]}</div>
                                <span class="name">${m.nickname || m.username}</span>
                                <div class="status ${m.online ? 'online' : ''}"></div>
                                ${m.role === 1 ? '<span style="color:var(--primary);font-size:12px;margin-left:4px">群主</span>' : ''}
                                ${isOwner && m.id !== currentUser.id ? `<button class="btn-recall" onclick="removeGroupMember(${groupId}, ${m.id})" style="margin-left:auto">移除</button>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <div class="dialog-actions">
                        ${isOwner ? `
                            <button class="dialog-cancel" style="background:var(--red);color:#fff" onclick="dissolveGroup(${groupId})">解散群组</button>
                            <button class="dialog-cancel" style="background:var(--primary);color:#fff" onclick="transferGroup(${groupId})">转让群组</button>
                        ` : `<button class="dialog-cancel" onclick="leaveGroup(${groupId})">退出群组</button>`}
                        <button class="dialog-cancel" onclick="this.closest('.dialog-overlay').remove()">关闭</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
            dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
        }
    } catch (e) { showToast('加载成员失败', 'error'); }
}

async function removeGroupMember(groupId, userId) {
    if (!confirm('确定要移除此成员吗？')) return;

    try {
        const r = await fetch(`${API}/api/group/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId, user_id: userId, operator_id: currentUser.id })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('成员已移除');
            document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());
            showGroupMembers(groupId);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function dissolveGroup(groupId) {
    if (!confirm('确定要解散此群组吗？此操作不可撤销！')) return;

    try {
        const r = await fetch(`${API}/api/group/dissolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId, user_id: currentUser.id })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('群组已解散');
            document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());
            loadGroups();
            if (currentTarget === -groupId) {
                currentTarget = null;
                document.getElementById('chat-target').innerHTML = '<span>选择会话开始聊天</span>';
                document.getElementById('msg-list').innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>选择左侧会话开始聊天</p></div>';
            }
            delete conversations['group_' + groupId];
            renderConversations();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function leaveGroup(groupId) {
    if (!confirm('确定要退出此群组吗？')) return;

    try {
        const r = await fetch(`${API}/api/group/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId, user_id: currentUser.id })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('已退出群组');
            document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());
            loadGroups();
            if (currentTarget === -groupId) {
                currentTarget = null;
                document.getElementById('chat-target').innerHTML = '<span>选择会话开始聊天</span>';
                document.getElementById('msg-list').innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>选择左侧会话开始聊天</p></div>';
            }
            delete conversations['group_' + groupId];
            renderConversations();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function transferGroup(groupId) {
    // 获取群组成员列表
    try {
        const r = await fetch(`${API}/api/group/members?group_id=${groupId}`);
        const data = await r.json();
        if (data.code === 0) {
            const members = data.data.filter(m => m.id !== currentUser.id);
            if (members.length === 0) {
                showToast('没有其他成员可以转让', 'error');
                return;
            }

            const dialog = document.createElement('div');
            dialog.className = 'dialog-overlay';
            dialog.innerHTML = `
                <div class="dialog" style="max-width:400px">
                    <h3>转让群组给</h3>
                    <div class="member-list">
                        ${members.map(m => `
                            <div class="contact-item" onclick="confirmTransfer(${groupId}, ${m.id}, '${m.nickname || m.username}')">
                                <div class="avatar" style="background: ${getAvatarColor(m.id)}">${(m.nickname || m.username)[0]}</div>
                                <span class="name">${m.nickname || m.username}</span>
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
    } catch (e) { showToast('加载成员失败', 'error'); }
}

async function confirmTransfer(groupId, toUserId, toUserName) {
    if (!confirm(`确定要将群组转让给 ${toUserName} 吗？`)) return;

    document.querySelectorAll('.dialog-overlay').forEach(d => d.remove());

    try {
        const r = await fetch(`${API}/api/group/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: groupId, from_user_id: currentUser.id, to_user_id: toUserId })
        });
        const data = await r.json();
        if (data.code === 0) {
            showToast('群组已转让给 ' + toUserName);
            showGroupMembers(groupId);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) { showToast('网络错误', 'error'); }
}

async function loadGroupMessages(groupId) {
    try {
        const r = await fetch(`${API}/api/group/messages?group_id=${groupId}`);
        const data = await r.json();
        if (data.code === 0) {
            messages[groupId] = data.data.map(m => ({
                id: m.id,
                from: m.from,
                content: m.content,
                file_id: m.file_id || null,
                time: m.time,
                self: m.from === currentUser.id,
                from_name: m.from_name
            }));
            renderMessages(groupId);

            // 滚动到底部显示最新消息
            setTimeout(() => {
                const list = document.getElementById('msg-list');
                if (list) list.scrollTop = list.scrollHeight;
            }, 50);
        }
    } catch (e) {
        console.error('加载群组消息失败:', e);
        if (!messages[groupId]) messages[groupId] = [];
        renderMessages(groupId);
    }
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
    const query = document.getElementById('searchInput').value;
    const queryLower = query.toLowerCase();

    document.querySelectorAll('.conversation-item').forEach(item => {
        const nameEl = item.querySelector('.name');
        const name = nameEl.textContent.toLowerCase();

        if (query && name.includes(queryLower)) {
            item.style.display = 'flex';
            // 高亮匹配的文本
            const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
            nameEl.innerHTML = nameEl.textContent.replace(regex, '<span class="search-highlight">$1</span>');
        } else {
            item.style.display = query ? 'none' : 'flex';
            // 恢复原始文本
            nameEl.innerHTML = nameEl.textContent;
        }
    });
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            <div style="text-align:center;margin-bottom:16px;">
                <div class="avatar" style="width:80px;height:80px;font-size:32px;margin:0 auto;cursor:pointer;background:${getAvatarColor(currentUser.id)}" onclick="document.getElementById('avatar-input').click()">
                    ${(profile.nickname || profile.username)[0]}
                </div>
                <input type="file" id="avatar-input" style="display:none" accept="image/*" onchange="uploadAvatar(event)">
                <div style="font-size:12px;color:var(--text3);margin-top:4px">点击头像更换</div>
            </div>
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

async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }

    const reader = new FileReader();
    reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        try {
            const r = await fetch(`${API}/api/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'avatar_' + currentUser.id + '.jpg',
                    file_data: base64,
                    from_user_id: currentUser.id,
                    to_user_id: 0
                })
            });
            const data = await r.json();
            if (data.code === 0) {
                // 保存头像ID到用户资料
                await fetch(`${API}/api/user/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: currentUser.id,
                        avatar_id: data.data.file_id
                    })
                });
                currentUser.avatar_id = data.data.file_id;
                sessionStorage.setItem('user', JSON.stringify(currentUser));

                // 更新对话框中的头像预览
                const dialogAvatar = document.querySelector('.dialog-overlay .avatar');
                if (dialogAvatar) {
                    dialogAvatar.innerHTML = `<img src="data:image/jpeg;base64,${base64}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                }

                // 更新左上角头像
                const currentAvatar = document.getElementById('currentAvatar');
                if (currentAvatar) {
                    currentAvatar.innerHTML = `<img src="data:image/jpeg;base64,${base64}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                }

                showToast('头像已更新');
            }
        } catch (e) { showToast('上传失败', 'error'); }
    };
    reader.readAsDataURL(file);
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

// 滚动加载更多消息
document.addEventListener('DOMContentLoaded', () => {
    const msgList = document.getElementById('msg-list');
    if (msgList) {
        msgList.addEventListener('scroll', () => {
            if (msgList.scrollTop < 50 && currentTarget && !messageLoading[Math.abs(currentTarget)]) {
                const userId = currentTarget < 0 ? null : currentTarget;
                if (userId && messages[userId] && messages[userId].length > 0) {
                    loadMessageHistory(userId, true);
                }
            }
        });
    }
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

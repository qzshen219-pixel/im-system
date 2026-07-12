# 即时通讯 API 文档

## WebSocket 连接

```
ws://localhost:8001/ws
```

## 消息格式

所有消息使用 JSON 格式。

---

## 认证相关

### 登录

**发送**
```json
{
    "type": "login",
    "user_id": 1,
    "token": "your_auth_token"
}
```

**响应**
```json
{
    "type": "login_ok",
    "user_id": 1
}
```

或

```json
{
    "type": "login_fail",
    "message": "Invalid token"
}
```

### 心跳

**发送**
```json
{
    "type": "heartbeat"
}
```

**响应**
```json
{
    "type": "heartbeat_ack"
}
```

---

## 聊天相关

### 单聊消息

**发送**
```json
{
    "type": "chat",
    "to": 2,
    "content": "Hello!",
    "msg_type": 1
}
```

**接收**
```json
{
    "type": "chat",
    "from": 1,
    "from_name": "Alice",
    "content": "Hello!",
    "msg_type": 1,
    "time": "2026-07-01 10:30:00"
}
```

### 群聊消息

**发送**
```json
{
    "type": "group_chat",
    "group_id": 100,
    "content": "大家好!",
    "msg_type": 1
}
```

### 消息确认

**发送**
```json
{
    "type": "ack",
    "msg_id": 12345
}
```

### 获取离线消息

**发送**
```json
{
    "type": "get_offline"
}
```

**响应**
```json
[
    {
        "type": "chat",
        "from": 2,
        "content": "你有一条新消息",
        "time": "2026-07-01 10:00:00"
    }
]
```

---

## HTTP API

### 用户注册

**POST /api/register**

请求：
```json
{
    "username": "alice",
    "password": "123456",
    "nickname": "Alice"
}
```

响应：
```json
{
    "code": 0,
    "message": "注册成功",
    "data": {
        "id": 1,
        "username": "alice"
    }
}
```

### 用户登录

**POST /api/login**

请求：
```json
{
    "username": "alice",
    "password": "123456"
}
```

响应：
```json
{
    "code": 0,
    "message": "登录成功",
    "data": {
        "id": 1,
        "username": "alice",
        "nickname": "Alice",
        "token": "xxx"
    }
}
```

### 获取好友列表

**GET /api/friends**

Headers: `X-User-Id: 1`

响应：
```json
{
    "code": 0,
    "data": [
        {
            "id": 2,
            "username": "bob",
            "nickname": "Bob",
            "online": true
        }
    ]
}
```

### 获取会话列表

**GET /api/conversations**

Headers: `X-User-Id: 1`

响应：
```json
{
    "code": 0,
    "data": [
        {
            "id": 2,
            "name": "Bob",
            "lastMsg": "你好",
            "time": "2026-07-01 10:30:00"
        }
    ]
}
```

### 获取历史消息

**GET /api/messages?target_id=2&page=1&page_size=20**

Headers: `X-User-Id: 1`

响应：
```json
{
    "code": 0,
    "data": [
        {
            "id": 1,
            "from": 1,
            "to": 2,
            "content": "你好",
            "time": "2026-07-01 10:30:00"
        }
    ]
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 用户名已存在 |
| 1002 | 用户名或密码错误 |
| 1003 | Token 无效 |
| 1004 | 用户不存在 |
| 2001 | 消息发送失败 |
| 2002 | 群组不存在 |
| 2003 | 无权访问 |

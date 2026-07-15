/**
 * WebSocket 服务器实现
 */

#include "ws_server.h"
#include "user_manager.h"
#include "message_handler.h"
#include "redis_client.h"
#include "json/json.h"

#include <iostream>
#include <sstream>
#include <chrono>
#include <ctime>
#include <iomanip>

WsServer::WsServer(int port, 
                   std::shared_ptr<UserManager> userManager,
                   std::shared_ptr<MessageHandler> msgHandler,
                   std::shared_ptr<RedisClient> redis)
    : m_port(port)
    , m_running(false)
    , m_userManager(userManager)
    , m_msgHandler(msgHandler)
    , m_redis(redis)
{
    // 初始化 WebSocket 服务器
    m_server.init_asio();
    m_server.set_reuse_addr(true);

    // 设置回调
    m_server.set_open_handler(
        std::bind(&WsServer::onOpen, this, std::placeholders::_1));
    m_server.set_close_handler(
        std::bind(&WsServer::onClose, this, std::placeholders::_1));
    m_server.set_message_handler(
        std::bind(&WsServer::onMessage, this, 
                  std::placeholders::_1, std::placeholders::_2));
}

WsServer::~WsServer() {
    stop();
}

void WsServer::start() {
    m_running = true;
    
    // 监听端口
    m_server.listen(m_port);
    m_server.start_accept();
    
    // 运行事件循环
    m_server.run();
}

void WsServer::stop() {
    if (m_running) {
        m_running = false;
        m_server.stop_listening();
        m_server.stop();
    }
}

void WsServer::onOpen(connection_hdl hdl) {
    std::cout << "[WS] 新连接建立" << std::endl;
    
    // 连接建立时还不知道用户ID
    // 等待第一条消息（登录消息）来关联
}

void WsServer::onClose(connection_hdl hdl) {
    std::cout << "[WS] 连接关闭" << std::endl;

    int userId = getUserIdFromHdl(hdl);
    if (userId > 0) {
        // 广播离线状态给好友
        broadcastStatusToFriends(userId, false);

        // 更新用户在线状态
        m_userManager->setOnline(userId, false);

        // 移除连接
        removeConnection(hdl);

        std::cout << "[WS] 用户 " << userId << " 离线" << std::endl;
    }
}

void WsServer::onMessage(connection_hdl hdl, websocketpp::config::asio::message_type::ptr msg) {
    try {
        // 解析 JSON 消息
        Json::Value root;
        Json::Reader reader;
        if (!reader.parse(msg->get_payload(), root)) {
            std::cerr << "[WS] JSON 解析失败" << std::endl;
            return;
        }

        std::string type = root["type"].asString();

        if (type == "login") {
            // 登录消息
            int userId = root["user_id"].asInt();
            std::string token = root["token"].asString();

            // 验证 token
            if (m_userManager->verifyToken(userId, token)) {
                // 关联用户ID和连接
                {
                    std::lock_guard<std::mutex> lock(m_connMutex);
                    m_connections[userId] = hdl;
                }

                // 更新在线状态
                m_userManager->setOnline(userId, true);

                // 发送登录成功响应
                Json::Value resp;
                resp["type"] = "login_ok";
                resp["user_id"] = userId;
                m_server.send(hdl, Json::FastWriter().write(resp), websocketpp::frame::opcode::text);

                // 广播在线状态给好友
                broadcastStatusToFriends(userId, true);

                std::cout << "[WS] 用户 " << userId << " 登录成功" << std::endl;
            } else {
                // 登录失败
                Json::Value resp;
                resp["type"] = "login_fail";
                resp["message"] = "Invalid token";
                m_server.send(hdl, Json::FastWriter().write(resp), websocketpp::frame::opcode::text);
            }
        }
        else if (type == "chat") {
            // 聊天消息
            int userId = getUserIdFromHdl(hdl);
            if (userId <= 0) {
                std::cerr << "[WS] 未登录用户发送消息" << std::endl;
                return;
            }
            
            int toUserId = root["to"].asInt();
            std::string content = root["content"].asString();
            int msgType = root.get("msg_type", 1).asInt();
            int fileId = root.get("file_id", 0).asInt();

            // 处理消息（保存到数据库）
            m_msgHandler->handleChatMessage(userId, toUserId, content, msgType, fileId);
            
            // 构建消息 JSON 并发送给接收者
            Json::Value msgJson;
            msgJson["type"] = "chat";
            msgJson["from"] = userId;
            msgJson["to"] = toUserId;
            msgJson["content"] = content;
            msgJson["msg_type"] = msgType;
            if (fileId > 0) {
                msgJson["file_id"] = fileId;
            }
            
            // 获取发送者昵称
            std::string fromName;
            m_userManager->getUserInfo(userId, fromName, fromName);
            msgJson["from_name"] = fromName;
            
            auto now = std::chrono::system_clock::now();
            auto t = std::chrono::system_clock::to_time_t(now);
            char timeBuf[32];
            std::strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", std::localtime(&t));
            msgJson["time"] = timeBuf;
            
            std::string msgStr = Json::FastWriter().write(msgJson);
            
            // 发送给接收者
            sendToUser(toUserId, msgStr);
        }
        else if (type == "group_chat") {
            // 群聊消息
            int userId = getUserIdFromHdl(hdl);
            if (userId <= 0) return;
            
            int groupId = root["group_id"].asInt();
            std::string content = root["content"].asString();
            int msgType = root.get("msg_type", 1).asInt();
            int fileId = root.get("file_id", 0).asInt();

            m_msgHandler->handleGroupMessage(userId, groupId, content, msgType, fileId);
            
            // 广播给群组成员
            Json::Value msgJson;
            msgJson["type"] = "group_chat";
            msgJson["from"] = userId;
            msgJson["group_id"] = groupId;
            msgJson["content"] = content;
            msgJson["msg_type"] = msgType;
            if (fileId > 0) {
                msgJson["file_id"] = fileId;
            }
            
            std::string fromName;
            m_userManager->getUserInfo(userId, fromName, fromName);
            msgJson["from_name"] = fromName;
            
            auto now = std::chrono::system_clock::now();
            auto t = std::chrono::system_clock::to_time_t(now);
            char timeBuf[32];
            std::strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", std::localtime(&t));
            msgJson["time"] = timeBuf;
            
            // 广播给群组所有成员
            broadcast(Json::FastWriter().write(msgJson));
        }
        else if (type == "heartbeat") {
            // 心跳
            int userId = getUserIdFromHdl(hdl);
            if (userId > 0) {
                m_userManager->updateHeartbeat(userId);
                
                Json::Value resp;
                resp["type"] = "heartbeat_ack";
                m_server.send(hdl, Json::FastWriter().write(resp), websocketpp::frame::opcode::text);
            }
        }
        else if (type == "typing") {
            // 输入状态提示
            int userId = getUserIdFromHdl(hdl);
            int toUserId = root["to"].asInt();
            
            // 转发给对方
            Json::Value typingMsg;
            typingMsg["type"] = "typing";
            typingMsg["from"] = userId;
            typingMsg["from_name"] = root["from_name"].asString();
            
            sendToUser(toUserId, Json::FastWriter().write(typingMsg));
        }
        else if (type == "ack") {
            // 消息确认
            int msgId = root["msg_id"].asInt();
            m_msgHandler->ackMessage(msgId);
        }
        else if (type == "read") {
            // 消息已读回执
            int fromUserId = root["from"].asInt();
            int msgId = root["msg_id"].asInt();
            
            // 标记消息已读
            m_msgHandler->ackMessage(msgId);
            
            // 发送已读回执给发送者
            Json::Value readReceipt;
            readReceipt["type"] = "read_receipt";
            readReceipt["msg_id"] = msgId;
            readReceipt["reader"] = getUserIdFromHdl(hdl);
            
            sendToUser(fromUserId, Json::FastWriter().write(readReceipt));
        }
        else if (type == "get_offline") {
            // 拉取离线消息
            int userId = getUserIdFromHdl(hdl);
            if (userId > 0) {
                auto offlineMsgs = m_msgHandler->getOfflineMessages(userId);
                for (auto& msgJson : offlineMsgs) {
                    m_server.send(hdl, Json::FastWriter().write(msgJson), websocketpp::frame::opcode::text);
                }
            }
        }
        else if (type == "pin") {
            // 消息置顶
            int userId = getUserIdFromHdl(hdl);
            int msgId = root["msg_id"].asInt();
            bool pinned = root.get("pinned", true).asBool();
            
            if (userId > 0 && msgId > 0) {
                // 保存置顶状态到 Redis
                std::string key = "pinned:" + std::to_string(userId);
                if (pinned) {
                    m_redis->hset(key, std::to_string(msgId), "1");
                } else {
                    m_redis->hdel(key, std::to_string(msgId));
                }
                
                // 发送确认
                Json::Value resp;
                resp["type"] = "pin_ack";
                resp["msg_id"] = msgId;
                resp["pinned"] = pinned;
                m_server.send(hdl, Json::FastWriter().write(resp), websocketpp::frame::opcode::text);
            }
        }
        else if (type == "get_pinned") {
            // 获取置顶消息
            int userId = getUserIdFromHdl(hdl);
            if (userId > 0) {
                std::string key = "pinned:" + std::to_string(userId);
                // 从 Redis 获取所有置顶消息 ID
                // 这里简化处理，前端可以自行管理
                Json::Value resp;
                resp["type"] = "pinned_list";
                resp["pinned_ids"] = Json::arrayValue;
                m_server.send(hdl, Json::FastWriter().write(resp), websocketpp::frame::opcode::text);
            }
        }

    } catch (const std::exception& e) {
        std::cerr << "[WS] 处理消息异常: " << e.what() << std::endl;
    }
}

int WsServer::getUserIdFromHdl(connection_hdl hdl) {
    std::lock_guard<std::mutex> lock(m_connMutex);
    // 遍历查找连接对应的用户ID
    for (auto& [userId, connHdl] : m_connections) {
        if (connHdl.lock() == hdl.lock()) {
            return userId;
        }
    }
    return -1;
}

void WsServer::removeConnection(connection_hdl hdl) {
    int userId = getUserIdFromHdl(hdl);
    
    if (userId > 0) {
        std::lock_guard<std::mutex> lock(m_connMutex);
        m_connections.erase(userId);
    }
}

void WsServer::sendToUser(int userId, const std::string& message) {
    std::lock_guard<std::mutex> lock(m_connMutex);
    auto it = m_connections.find(userId);
    if (it != m_connections.end()) {
        m_server.send(it->second, message, websocketpp::frame::opcode::text);
    }
}

void WsServer::broadcast(const std::string& message) {
    std::lock_guard<std::mutex> lock(m_connMutex);
    for (auto& [userId, hdl] : m_connections) {
        m_server.send(hdl, message, websocketpp::frame::opcode::text);
    }
}

bool WsServer::isUserOnline(int userId) {
    std::lock_guard<std::mutex> lock(m_connMutex);
    return m_connections.find(userId) != m_connections.end();
}

void WsServer::broadcastStatusToFriends(int userId, bool online) {
    // 获取好友列表
    auto friends = m_userManager->getFriends(userId);

    // 构建状态消息
    Json::Value statusMsg;
    statusMsg["type"] = "status_change";
    statusMsg["user_id"] = userId;
    statusMsg["online"] = online;

    std::string msgStr = Json::FastWriter().write(statusMsg);

    // 发送给所有在线好友
    for (int friendId : friends) {
        sendToUser(friendId, msgStr);
    }
}

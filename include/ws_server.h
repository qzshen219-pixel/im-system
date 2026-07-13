/**
 * WebSocket 服务器
 * 
 * 功能：
 * - 管理 WebSocket 连接
 * - 处理连接建立/关闭
 * - 消息路由
 */

#ifndef WS_SERVER_H
#define WS_SERVER_H

#include <memory>
#include <string>
#include <unordered_map>
#include <mutex>
#include <functional>
#include <thread>

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

typedef websocketpp::server<websocketpp::config::asio> ws_server;
typedef websocketpp::connection_hdl connection_hdl;

class UserManager;
class MessageHandler;

class UserManager;
class MessageHandler;
class RedisClient;

class WsServer {
public:
    WsServer(int port, 
             std::shared_ptr<UserManager> userManager,
             std::shared_ptr<MessageHandler> msgHandler,
             std::shared_ptr<RedisClient> redis);
    ~WsServer();

    // 启动服务器
    void start();

    // 停止服务器
    void stop();

    // 发送消息给指定用户
    void sendToUser(int userId, const std::string& message);

    // 广播消息给所有在线用户
    void broadcast(const std::string& message);

    // 检查用户是否在线
    bool isUserOnline(int userId);

private:
    // WebSocket 回调
    void onOpen(connection_hdl hdl);
    void onClose(connection_hdl hdl);
    void onMessage(connection_hdl hdl, websocketpp::config::asio::message_type::ptr msg);

    // 获取连接对应的用户ID
    int getUserIdFromHdl(connection_hdl hdl);

    // 移除连接
    void removeConnection(connection_hdl hdl);

    // 广播状态变化给好友
    void broadcastStatusToFriends(int userId, bool online);

    ws_server m_server;
    int m_port;
    bool m_running;

    // 连接映射: user_id -> connection_hdl
    std::unordered_map<int, connection_hdl> m_connections;
    std::mutex m_connMutex;

    std::shared_ptr<UserManager> m_userManager;
    std::shared_ptr<MessageHandler> m_msgHandler;
    std::shared_ptr<RedisClient> m_redis;

    std::thread m_thread;
};

#endif // WS_SERVER_H

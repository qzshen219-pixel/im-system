/**
 * 消息处理器实现
 */

#include "message_handler.h"
#include "redis_client.h"
#include "mysql_client.h"
#include "user_manager.h"

#include <sstream>
#include <chrono>
#include <ctime>

MessageHandler::MessageHandler(std::shared_ptr<RedisClient> redis,
                               std::shared_ptr<MysqlClient> mysql,
                               std::shared_ptr<UserManager> userManager)
    : m_redis(redis)
    , m_mysql(mysql)
    , m_userManager(userManager)
{
}

MessageHandler::~MessageHandler()
{
}

// 处理单聊消息
void MessageHandler::handleChatMessage(int fromUserId, int toUserId,
                                       const std::string& content, int msgType, int fileId)
{
    // 1. 持久化到 MySQL
    int msgId = saveMessage(fromUserId, toUserId, 0, content, msgType, fileId);

    // 2. 构建消息 JSON
    Json::Value msgJson;
    msgJson["type"] = "chat";
    msgJson["msg_id"] = msgId;
    msgJson["from"] = fromUserId;
    msgJson["to"] = toUserId;
    msgJson["content"] = content;
    msgJson["msg_type"] = msgType;

    // 获取发送者昵称
    std::string fromName;
    m_userManager->getUserInfo(fromUserId, fromName, fromName);
    msgJson["from_name"] = fromName;

    // 时间戳
    auto now = std::chrono::system_clock::now();
    auto t = std::chrono::system_clock::to_time_t(now);
    char timeBuf[32];
    std::strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", std::localtime(&t));
    msgJson["time"] = timeBuf;

    std::string msgStr = Json::FastWriter().write(msgJson);

    // 3. 保存到 Redis 离线队列（如果用户不在线）
    if (!m_userManager->isOnline(toUserId)) {
        saveOfflineMessage(toUserId, msgJson);
    }

    // 4. 更新会话
    updateConversation(fromUserId, toUserId, content);
    updateConversation(toUserId, fromUserId, content);
}

// 处理群聊消息
void MessageHandler::handleGroupMessage(int fromUserId, int groupId,
                                        const std::string& content, int msgType)
{
    // 1. 检查用户是否在群组中
    std::string checkSql = "SELECT user_id FROM group_members WHERE group_id = " 
        + std::to_string(groupId) + " AND user_id = " + std::to_string(fromUserId);
    m_mysql->query(checkSql);
    if (m_mysql->getResult().empty()) {
        return;  // 不在群组中
    }

    // 2. 持久化到 MySQL
    int msgId = saveMessage(fromUserId, 0, groupId, content, msgType);

    // 3. 获取群组成员
    std::string memberSql = "SELECT user_id FROM group_members WHERE group_id = " 
        + std::to_string(groupId);
    m_mysql->query(memberSql);
    auto members = m_mysql->getResult();

    // 4. 构建消息 JSON
    Json::Value msgJson;
    msgJson["type"] = "group_chat";
    msgJson["msg_id"] = msgId;
    msgJson["from"] = fromUserId;
    msgJson["group_id"] = groupId;
    msgJson["content"] = content;
    msgJson["msg_type"] = msgType;

    std::string fromName;
    m_userManager->getUserInfo(fromUserId, fromName, fromName);
    msgJson["from_name"] = fromName;

    auto now = std::chrono::system_clock::now();
    auto t = std::chrono::system_clock::to_time_t(now);
    char timeBuf[32];
    std::strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", std::localtime(&t));
    msgJson["time"] = timeBuf;

    std::string msgStr = Json::FastWriter().write(msgJson);

    // 5. 广播给群组成员（除了发送者）
    for (auto& member : members) {
        int memberUserId = std::stoi(member[0]);
        if (memberUserId != fromUserId) {
            if (!m_userManager->isOnline(memberUserId)) {
                saveOfflineMessage(memberUserId, msgJson);
            }
        }
    }
}

// 获取离线消息
std::vector<Json::Value> MessageHandler::getOfflineMessages(int userId)
{
    std::vector<Json::Value> messages;
    
    std::string key = "offline:" + std::to_string(userId);
    
    // 从 Redis 获取离线消息
    long len = m_redis->llen(key);
    if (len > 0) {
        for (long i = 0; i < len; i++) {
            std::string msgStr = m_redis->lpop(key);
            if (!msgStr.empty()) {
                Json::Value msgJson;
                Json::Reader reader;
                if (reader.parse(msgStr, msgJson)) {
                    messages.push_back(msgJson);
                }
            }
        }
    }
    
    return messages;
}

// 消息确认
void MessageHandler::ackMessage(int msgId)
{
    std::string sql = "UPDATE messages SET status = 1 WHERE id = " + std::to_string(msgId);
    m_mysql->query(sql);
}

// 获取会话列表
std::vector<Json::Value> MessageHandler::getConversations(int userId)
{
    std::vector<Json::Value> conversations;
    
    // 从 Redis 获取最近会话
    std::string key = "conversations:" + std::to_string(userId);
    auto memberScores = m_redis->zrevrangebyscore(key, "+inf", "-inf", 0, 20);
    
    for (auto& member : memberScores) {
        int targetId = std::stoi(member.first);
        
        // 获取目标用户信息
        std::string username, nickname;
        m_userManager->getUserInfo(targetId, username, nickname);
        
        Json::Value conv;
        conv["id"] = targetId;
        conv["name"] = nickname.empty() ? username : nickname;
        conv["online"] = m_userManager->isOnline(targetId);
        
        // 获取最后一条消息
        std::string lastMsgKey = "last_msg:" + std::to_string(userId) + ":" + std::to_string(targetId);
        conv["lastMsg"] = m_redis->get(lastMsgKey);
        
        conversations.push_back(conv);
    }
    
    return conversations;
}

// 获取历史消息
std::vector<Json::Value> MessageHandler::getHistoryMessages(int userId, int targetId,
                                                            int page, int pageSize)
{
    std::vector<Json::Value> messages;
    
    int offset = (page - 1) * pageSize;
    std::string sql = "SELECT id, from_user_id, to_user_id, content, msg_type, created_at "
        "FROM messages WHERE "
        "(from_user_id = " + std::to_string(userId) + " AND to_user_id = " + std::to_string(targetId) + ") "
        "OR (from_user_id = " + std::to_string(targetId) + " AND to_user_id = " + std::to_string(userId) + ") "
        "ORDER BY created_at DESC LIMIT " + std::to_string(pageSize) 
        + " OFFSET " + std::to_string(offset);
    
    m_mysql->query(sql);
    auto result = m_mysql->getResult();
    
    for (auto& row : result) {
        Json::Value msg;
        msg["id"] = std::stoi(row[0]);
        msg["from"] = std::stoi(row[1]);
        msg["to"] = std::stoi(row[2]);
        msg["content"] = row[3];
        msg["msg_type"] = std::stoi(row[4]);
        msg["time"] = row[5];
        messages.push_back(msg);
    }
    
    return messages;
}

// 保存消息到 MySQL
int MessageHandler::saveMessage(int fromUserId, int toUserId, int groupId,
                                const std::string& content, int msgType, int fileId)
{
    std::string sql = "INSERT INTO messages (from_user_id, to_user_id, group_id, content, msg_type, file_id) "
        "VALUES (" + std::to_string(fromUserId) + ", "
        + std::to_string(toUserId) + ", "
        + std::to_string(groupId) + ", '"
        + content + "', "
        + std::to_string(msgType) + ", "
        + std::to_string(fileId) + ")";

    m_mysql->query(sql);
    return m_mysql->insertId();
}

// 保存离线消息
void MessageHandler::saveOfflineMessage(int userId, const Json::Value& msg)
{
    std::string key = "offline:" + std::to_string(userId);
    std::string msgStr = Json::FastWriter().write(msg);
    m_redis->rpush(key, msgStr);
    // 最多保留 1000 条离线消息
    m_redis->ltrim(key, -1000, -1);
}

// 更新会话
void MessageHandler::updateConversation(int userId, int targetId,
                                        const std::string& lastMsg)
{
    // 更新 Redis 中的会话排序（按时间戳）
    std::string key = "conversations:" + std::to_string(userId);
    double score = std::chrono::system_clock::to_time_t(
        std::chrono::system_clock::now());
    m_redis->zadd(key, std::to_string(targetId), score);
    
    // 保存最后一条消息
    std::string lastMsgKey = "last_msg:" + std::to_string(userId) + ":" + std::to_string(targetId);
    m_redis->set(lastMsgKey, lastMsg);
}

/**
 * 消息处理器
 * 
 * 功能：
 * - 处理聊天消息
 * - 消息持久化
 * - 离线消息管理
 * - 消息确认
 */

#ifndef MESSAGE_HANDLER_H
#define MESSAGE_HANDLER_H

#include <memory>
#include <string>
#include <vector>

#include "json/json.h"

class RedisClient;
class MysqlClient;
class UserManager;

class MessageHandler {
public:
    MessageHandler(std::shared_ptr<RedisClient> redis,
                   std::shared_ptr<MysqlClient> mysql,
                   std::shared_ptr<UserManager> userManager);
    ~MessageHandler();

    // 处理单聊消息
    void handleChatMessage(int fromUserId, int toUserId,
                           const std::string& content, int msgType, int fileId = 0);

    // 处理群聊消息
    void handleGroupMessage(int fromUserId, int groupId,
                            const std::string& content, int msgType);

    // 获取离线消息
    std::vector<Json::Value> getOfflineMessages(int userId);

    // 消息确认
    void ackMessage(int msgId);

    // 获取会话列表
    std::vector<Json::Value> getConversations(int userId);

    // 获取历史消息
    std::vector<Json::Value> getHistoryMessages(int userId, int targetId, 
                                                int page, int pageSize);

private:
    int saveMessage(int fromUserId, int toUserId, int groupId,
                    const std::string& content, int msgType, int fileId = 0);
    
    void saveOfflineMessage(int userId, const Json::Value& msg);
    
    void updateConversation(int userId, int targetId, 
                           const std::string& lastMsg);

    std::shared_ptr<RedisClient> m_redis;
    std::shared_ptr<MysqlClient> m_mysql;
    std::shared_ptr<UserManager> m_userManager;
};

#endif // MESSAGE_HANDLER_H

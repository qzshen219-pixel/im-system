/**
 * 用户管理器
 * 
 * 功能：
 * - 用户注册/登录
 * - Token 验证
 * - 在线状态管理
 * - 心跳管理
 */

#ifndef USER_MANAGER_H
#define USER_MANAGER_H

#include <memory>
#include <string>
#include <unordered_map>
#include <mutex>

class RedisClient;
class MysqlClient;

class UserManager {
public:
    UserManager(std::shared_ptr<RedisClient> redis,
                std::shared_ptr<MysqlClient> mysql);
    ~UserManager();

    // 用户注册
    bool registerUser(const std::string& username, 
                      const std::string& password,
                      const std::string& nickname);

    // 用户登录，返回 token
    std::string login(const std::string& username,
                      const std::string& password,
                      int& userId);

    // 验证 token
    bool verifyToken(int userId, const std::string& token);

    // 设置在线状态
    void setOnline(int userId, bool online);

    // 检查是否在线
    bool isOnline(int userId);

    // 更新心跳
    void updateHeartbeat(int userId);

    // 检查超时用户
    void checkTimeout();

    // 获取用户信息
    bool getUserInfo(int userId, std::string& username, std::string& nickname);

private:
    std::string generateToken();
    std::string hashPassword(const std::string& password);
    bool verifyPassword(const std::string& password, const std::string& storedHash);

    std::shared_ptr<RedisClient> m_redis;
    std::shared_ptr<MysqlClient> m_mysql;

    // 心跳记录
    std::unordered_map<int, time_t> m_heartbeats;
    std::mutex m_heartbeatMutex;
};

#endif // USER_MANAGER_H

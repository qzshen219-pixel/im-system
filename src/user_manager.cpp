/**
 * 用户管理器实现
 */

#include "user_manager.h"
#include "redis_client.h"
#include "mysql_client.h"

#include <openssl/md5.h>
#include <openssl/sha.h>
#include <sstream>
#include <iomanip>
#include <random>
#include <chrono>

UserManager::UserManager(std::shared_ptr<RedisClient> redis,
                         std::shared_ptr<MysqlClient> mysql)
    : m_redis(redis)
    , m_mysql(mysql)
{
}

UserManager::~UserManager()
{
}

// 用户注册
bool UserManager::registerUser(const std::string& username,
                               const std::string& password,
                               const std::string& nickname)
{
    // 检查用户名是否已存在
    std::string checkSql = "SELECT id FROM users WHERE username = '" + username + "'";
    m_mysql->query(checkSql);
    auto result = m_mysql->getResult();
    if (!result.empty()) {
        return false;  // 用户名已存在
    }

    // 密码加密
    std::string passwordHash = hashPassword(password);

    // 插入用户
    std::string insertSql = "INSERT INTO users (username, password_hash, nickname) VALUES ('" 
        + username + "', '" + passwordHash + "', '" + nickname + "')";
    
    if (!m_mysql->query(insertSql)) {
        return false;
    }

    return true;
}

// 用户登录
std::string UserManager::login(const std::string& username,
                               const std::string& password,
                               int& userId)
{
    // 查询用户
    std::string sql = "SELECT id, password_hash FROM users WHERE username = '" + username + "'";
    m_mysql->query(sql);
    auto result = m_mysql->getResult();
    
    if (result.empty()) {
        return "";  // 用户不存在
    }

    userId = std::stoi(result[0][0]);
    std::string storedHash = result[0][1];

    // 验证密码
    if (!verifyPassword(password, storedHash)) {
        return "";  // 密码错误
    }

    // 生成 Token
    std::string token = generateToken();
    
    // 存储 Token 到 Redis (24小时过期)
    std::string tokenKey = "token:" + std::to_string(userId);
    m_redis->setex(tokenKey, 86400, token);

    // 更新数据库中的 token
    std::string updateSql = "UPDATE users SET token = '" + token + "' WHERE id = " + std::to_string(userId);
    m_mysql->query(updateSql);

    return token;
}

// 验证 Token
bool UserManager::verifyToken(int userId, const std::string& token)
{
    std::string tokenKey = "token:" + std::to_string(userId);
    std::string storedToken = m_redis->get(tokenKey);
    
    if (storedToken.empty()) {
        // Redis 中没有，从数据库查询
        std::string sql = "SELECT token FROM users WHERE id = " + std::to_string(userId);
        m_mysql->query(sql);
        auto result = m_mysql->getResult();
        
        if (result.empty() || result[0][0] != token) {
            return false;
        }
        
        // 缓存到 Redis
        m_redis->setex(tokenKey, 86400, token);
        return true;
    }
    
    return storedToken == token;
}

// 设置在线状态
void UserManager::setOnline(int userId, bool online)
{
    std::string key = "online:" + std::to_string(userId);
    if (online) {
        m_redis->setex(key, 120, "1");  // 120秒过期
    } else {
        m_redis->del(key);
    }
}

// 检查是否在线
bool UserManager::isOnline(int userId)
{
    std::string key = "online:" + std::to_string(userId);
    return m_redis->get(key) == "1";
}

// 更新心跳
void UserManager::updateHeartbeat(int userId)
{
    std::lock_guard<std::mutex> lock(m_heartbeatMutex);
    m_heartbeats[userId] = std::chrono::system_clock::to_time_t(
        std::chrono::system_clock::now());
    
    // 续期在线状态
    setOnline(userId, true);
}

// 检查超时用户
void UserManager::checkTimeout()
{
    std::lock_guard<std::mutex> lock(m_heartbeatMutex);
    time_t now = std::chrono::system_clock::to_time_t(
        std::chrono::system_clock::now());
    
    for (auto it = m_heartbeats.begin(); it != m_heartbeats.end(); ) {
        if (now - it->second > 120) {  // 120秒超时
            // 标记用户离线
            setOnline(it->first, false);
            it = m_heartbeats.erase(it);
        } else {
            ++it;
        }
    }
}

// 获取用户信息
bool UserManager::getUserInfo(int userId, std::string& username, std::string& nickname)
{
    std::string sql = "SELECT username, nickname, avatar_id FROM users WHERE id = " + std::to_string(userId);
    m_mysql->query(sql);
    auto result = m_mysql->getResult();

    if (result.empty()) {
        return false;
    }

    username = result[0][0];
    nickname = result[0][1];
    return true;
}

std::vector<int> UserManager::getFriends(int userId)
{
    std::vector<int> friends;
    std::string sql = "SELECT friend_id FROM friends WHERE user_id = " + std::to_string(userId) + " AND status = 'accepted' "
        "UNION "
        "SELECT user_id FROM friends WHERE friend_id = " + std::to_string(userId) + " AND status = 'accepted'";
    m_mysql->query(sql);
    auto result = m_mysql->getResult();

    for (auto& row : result) {
        friends.push_back(std::stoi(row[0]));
    }

    return friends;
}

// 生成 Token
std::string UserManager::generateToken()
{
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);
    
    std::stringstream ss;
    for (int i = 0; i < 32; i++) {
        ss << std::hex << dis(gen);
    }
    return ss.str();
}

// 密码哈希（带盐值）
std::string UserManager::hashPassword(const std::string& password)
{
    // 生成随机盐值
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 15);
    
    std::stringstream saltStream;
    for (int i = 0; i < 16; i++) {
        saltStream << std::hex << dis(gen);
    }
    std::string salt = saltStream.str();
    
    // 计算 SHA256(salt + password)
    std::string saltedPassword = salt + password;
    unsigned char digest[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(saltedPassword.c_str()), 
           saltedPassword.length(), digest);
    
    std::stringstream hashStream;
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        hashStream << std::hex << std::setw(2) << std::setfill('0') 
           << static_cast<int>(digest[i]);
    }
    
    // 返回格式: 盐值:哈希值
    return salt + ":" + hashStream.str();
}

// 验证密码
bool UserManager::verifyPassword(const std::string& password, const std::string& storedHash)
{
    // 从存储的哈希中提取盐值
    size_t colonPos = storedHash.find(':');
    if (colonPos == std::string::npos) {
        // 兼容旧的无盐值MD5格式
        unsigned char digest[MD5_DIGEST_LENGTH];
        MD5(reinterpret_cast<const unsigned char*>(password.c_str()), 
            password.length(), digest);
        
        std::stringstream ss;
        for (int i = 0; i < MD5_DIGEST_LENGTH; i++) {
            ss << std::hex << std::setw(2) << std::setfill('0') 
               << static_cast<int>(digest[i]);
        }
        return ss.str() == storedHash;
    }
    
    std::string salt = storedHash.substr(0, colonPos);
    std::string hash = storedHash.substr(colonPos + 1);
    
    // 使用相同的盐值计算哈希
    std::string saltedPassword = salt + password;
    unsigned char digest[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(saltedPassword.c_str()), 
           saltedPassword.length(), digest);
    
    std::stringstream ss;
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        ss << std::hex << std::setw(2) << std::setfill('0') 
           << static_cast<int>(digest[i]);
    }
    
    return ss.str() == hash;
}

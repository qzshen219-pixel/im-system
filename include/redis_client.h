/**
 * Redis 客户端
 */

#ifndef REDIS_CLIENT_H
#define REDIS_CLIENT_H

#include <string>
#include <memory>
#include <vector>
#include <utility>
#include <hiredis/hiredis.h>

class RedisClient {
public:
    RedisClient(const std::string& host, int port);
    ~RedisClient();

    bool connect();
    void disconnect();

    // 字符串操作
    bool set(const std::string& key, const std::string& value);
    bool setex(const std::string& key, int seconds, const std::string& value);
    std::string get(const std::string& key);
    bool del(const std::string& key);

    // 哈希操作
    bool hset(const std::string& key, const std::string& field, const std::string& value);
    std::string hget(const std::string& key, const std::string& field);
    bool hdel(const std::string& key, const std::string& field);

    // 列表操作
    bool lpush(const std::string& key, const std::string& value);
    bool rpush(const std::string& key, const std::string& value);
    std::string lpop(const std::string& key);
    bool ltrim(const std::string& key, long start, long stop);
    long llen(const std::string& key);

    // 有序集合操作
    bool zadd(const std::string& key, const std::string& member, double score);
    std::vector<std::pair<std::string, double>> zrevrangebyscore(
        const std::string& key, const std::string& max, const std::string& min,
        long offset, long count);

    // 发布订阅
    bool publish(const std::string& channel, const std::string& message);

private:
    std::string m_host;
    int m_port;
    redisContext* m_ctx;
};

#endif // REDIS_CLIENT_H

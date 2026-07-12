/**
 * Redis 客户端实现
 */

#include "redis_client.h"
#include <iostream>

RedisClient::RedisClient(const std::string& host, int port)
    : m_host(host)
    , m_port(port)
    , m_ctx(nullptr)
{
}

RedisClient::~RedisClient()
{
    disconnect();
}

bool RedisClient::connect()
{
    m_ctx = redisConnect(m_host.c_str(), m_port);
    if (m_ctx == nullptr || m_ctx->err) {
        if (m_ctx) {
            std::cerr << "[Redis] 连接失败: " << m_ctx->errstr << std::endl;
            redisFree(m_ctx);
            m_ctx = nullptr;
        }
        return false;
    }
    return true;
}

void RedisClient::disconnect()
{
    if (m_ctx) {
        redisFree(m_ctx);
        m_ctx = nullptr;
    }
}

bool RedisClient::set(const std::string& key, const std::string& value)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "SET %s %s", 
        key.c_str(), value.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_STATUS);
    if (reply) freeReplyObject(reply);
    return ok;
}

bool RedisClient::setex(const std::string& key, int seconds, const std::string& value)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "SETEX %s %d %s", 
        key.c_str(), seconds, value.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_STATUS);
    if (reply) freeReplyObject(reply);
    return ok;
}

std::string RedisClient::get(const std::string& key)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "GET %s", key.c_str());
    std::string result;
    if (reply && reply->type == REDIS_REPLY_STRING) {
        result = reply->str;
    }
    if (reply) freeReplyObject(reply);
    return result;
}

bool RedisClient::del(const std::string& key)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "DEL %s", key.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_INTEGER);
    if (reply) freeReplyObject(reply);
    return ok;
}

bool RedisClient::hset(const std::string& key, const std::string& field, const std::string& value)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "HSET %s %s %s", 
        key.c_str(), field.c_str(), value.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_INTEGER);
    if (reply) freeReplyObject(reply);
    return ok;
}

std::string RedisClient::hget(const std::string& key, const std::string& field)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "HGET %s %s", 
        key.c_str(), field.c_str());
    std::string result;
    if (reply && reply->type == REDIS_REPLY_STRING) {
        result = reply->str;
    }
    if (reply) freeReplyObject(reply);
    return result;
}

bool RedisClient::hdel(const std::string& key, const std::string& field)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "HDEL %s %s", 
        key.c_str(), field.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_INTEGER);
    if (reply) freeReplyObject(reply);
    return ok;
}

bool RedisClient::lpush(const std::string& key, const std::string& value)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "LPUSH %s %s", 
        key.c_str(), value.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_INTEGER);
    if (reply) freeReplyObject(reply);
    return ok;
}

bool RedisClient::rpush(const std::string& key, const std::string& value)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "RPUSH %s %s", 
        key.c_str(), value.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_INTEGER);
    if (reply) freeReplyObject(reply);
    return ok;
}

std::string RedisClient::lpop(const std::string& key)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "LPOP %s", key.c_str());
    std::string result;
    if (reply && reply->type == REDIS_REPLY_STRING) {
        result = reply->str;
    }
    if (reply) freeReplyObject(reply);
    return result;
}

bool RedisClient::ltrim(const std::string& key, long start, long stop)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "LTRIM %s %ld %ld", 
        key.c_str(), start, stop);
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_STATUS);
    if (reply) freeReplyObject(reply);
    return ok;
}

long RedisClient::llen(const std::string& key)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "LLEN %s", key.c_str());
    long result = 0;
    if (reply && reply->type == REDIS_REPLY_INTEGER) {
        result = reply->integer;
    }
    if (reply) freeReplyObject(reply);
    return result;
}

bool RedisClient::zadd(const std::string& key, const std::string& member, double score)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "ZADD %s %f %s", 
        key.c_str(), score, member.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_INTEGER);
    if (reply) freeReplyObject(reply);
    return ok;
}

std::vector<std::pair<std::string, double>> RedisClient::zrevrangebyscore(
    const std::string& key, const std::string& max, const std::string& min,
    long offset, long count)
{
    std::vector<std::pair<std::string, double>> result;
    
    redisReply* reply = (redisReply*)redisCommand(m_ctx, 
        "ZREVRANGEBYSCORE %s %s %s WITHSCORES LIMIT %ld %ld",
        key.c_str(), max.c_str(), min.c_str(), offset, count);
    
    if (reply && reply->type == REDIS_REPLY_ARRAY) {
        for (size_t i = 0; i < reply->elements; i += 2) {
            std::string member = reply->element[i]->str;
            double score = std::stod(reply->element[i + 1]->str);
            result.push_back({member, score});
        }
    }
    
    if (reply) freeReplyObject(reply);
    return result;
}

bool RedisClient::publish(const std::string& channel, const std::string& message)
{
    redisReply* reply = (redisReply*)redisCommand(m_ctx, "PUBLISH %s %s", 
        channel.c_str(), message.c_str());
    bool ok = (reply != nullptr && reply->type == REDIS_REPLY_INTEGER);
    if (reply) freeReplyObject(reply);
    return ok;
}

/**
 * MySQL 客户端实现
 */

#include "mysql_client.h"
#include <iostream>
#include <cstring>
#include <thread>
#include <chrono>

MysqlClient::MysqlClient(const std::string& host, const std::string& user,
                         const std::string& password, const std::string& database)
    : m_host(host)
    , m_user(user)
    , m_password(password)
    , m_database(database)
    , m_conn(nullptr)
    , m_result(nullptr)
    , m_stmt(nullptr)
{
}

MysqlClient::~MysqlClient()
{
    disconnect();
}

bool MysqlClient::connect()
{
    m_conn = mysql_init(nullptr);
    if (!m_conn) {
        std::cerr << "[MySQL] 初始化失败" << std::endl;
        return false;
    }

    // 设置字符集
    mysql_options(m_conn, MYSQL_SET_CHARSET_NAME, "utf8mb4");

    // 启用自动重连
    bool reconnect = true;
    mysql_options(m_conn, MYSQL_OPT_RECONNECT, &reconnect);

    // 设置超时时间
    unsigned int connect_timeout = 60;
    unsigned int read_timeout = 60;
    unsigned int write_timeout = 60;
    mysql_options(m_conn, MYSQL_OPT_CONNECT_TIMEOUT, &connect_timeout);
    mysql_options(m_conn, MYSQL_OPT_READ_TIMEOUT, &read_timeout);
    mysql_options(m_conn, MYSQL_OPT_WRITE_TIMEOUT, &write_timeout);

    if (!mysql_real_connect(m_conn, m_host.c_str(), m_user.c_str(),
                            m_password.c_str(), m_database.c_str(),
                            0, nullptr, 0)) {
        std::cerr << "[MySQL] 连接失败: " << mysql_error(m_conn) << std::endl;
        mysql_close(m_conn);
        m_conn = nullptr;
        return false;
    }

    // 设置连接字符集
    mysql_set_character_set(m_conn, "utf8mb4");

    return true;
}

void MysqlClient::disconnect()
{
    if (m_result) {
        mysql_free_result(m_result);
        m_result = nullptr;
    }
    if (m_stmt) {
        mysql_stmt_close(m_stmt);
        m_stmt = nullptr;
    }
    if (m_conn) {
        mysql_close(m_conn);
        m_conn = nullptr;
    }
}

bool MysqlClient::ensureConnection()
{
    if (!m_conn) {
        std::cerr << "[MySQL] 连接为null，尝试连接..." << std::endl;
        return connect();
    }

    // 使用 ping 检查连接是否有效
    if (mysql_ping(m_conn) != 0) {
        std::cerr << "[MySQL] 连接失效，尝试重连... 错误: " << mysql_error(m_conn) << std::endl;
        disconnect();
        return connect();
    }

    return true;
}

bool MysqlClient::query(const std::string& sql)
{
    // 确保连接有效
    if (!ensureConnection()) {
        std::cerr << "[MySQL] 无法建立连接" << std::endl;
        return false;
    }

    if (m_result) {
        mysql_free_result(m_result);
        m_result = nullptr;
    }

    int retryCount = 2;
    while (retryCount > 0) {
        if (mysql_query(m_conn, sql.c_str()) == 0) {
            m_result = mysql_store_result(m_conn);
            return true;
        }

        int errCode = mysql_errno(m_conn);
        std::cerr << "[MySQL] 查询失败 (错误码: " << errCode << "): " << mysql_error(m_conn) << std::endl;

        // 连接相关错误，尝试重连
        if (errCode == 2006 || errCode == 2013 || errCode == 2014 || errCode == 2003) {
            std::cerr << "[MySQL] 连接错误，尝试重连..." << std::endl;
            disconnect();
            if (connect()) {
                retryCount--;
                continue;
            } else {
                return false;
            }
        }

        // 其他错误，不重试
        return false;
    }

    return false;
}

std::vector<std::vector<std::string>> MysqlClient::getResult()
{
    std::vector<std::vector<std::string>> rows;

    if (!m_result) return rows;

    MYSQL_ROW row;
    int numFields = mysql_num_fields(m_result);

    while ((row = mysql_fetch_row(m_result))) {
        std::vector<std::string> rowData;
        for (int i = 0; i < numFields; i++) {
            rowData.push_back(row[i] ? row[i] : "");
        }
        rows.push_back(rowData);
    }

    mysql_free_result(m_result);
    m_result = nullptr;

    return rows;
}

long long MysqlClient::insertId()
{
    if (!m_conn) return -1;
    return mysql_insert_id(m_conn);
}

bool MysqlClient::prepare(const std::string& sql)
{
    if (!ensureConnection()) {
        return false;
    }

    if (m_stmt) {
        mysql_stmt_close(m_stmt);
    }

    m_stmt = mysql_stmt_init(m_conn);
    if (!m_stmt) return false;

    if (mysql_stmt_prepare(m_stmt, sql.c_str(), sql.length()) != 0) {
        std::cerr << "[MySQL] 预处理失败: " << mysql_stmt_error(m_stmt) << std::endl;
        return false;
    }

    return true;
}

bool MysqlClient::bindParam(int index, const std::string& value)
{
    if (!m_stmt) return false;

    MYSQL_BIND bind;
    memset(&bind, 0, sizeof(bind));

    bind.buffer_type = MYSQL_TYPE_STRING;
    bind.buffer = const_cast<char*>(value.c_str());
    bind.buffer_length = value.length();
    bind.is_null = 0;

    if (mysql_stmt_bind_param(m_stmt, &bind) != 0) {
        return false;
    }

    return true;
}

bool MysqlClient::bindParam(int index, int value)
{
    if (!m_stmt) return false;

    MYSQL_BIND bind;
    memset(&bind, 0, sizeof(bind));

    bind.buffer_type = MYSQL_TYPE_LONG;
    bind.buffer = &value;
    bind.is_null = 0;

    if (mysql_stmt_bind_param(m_stmt, &bind) != 0) {
        return false;
    }

    return true;
}

bool MysqlClient::execute()
{
    if (!m_stmt) return false;

    if (mysql_stmt_execute(m_stmt) != 0) {
        std::cerr << "[MySQL] 执行失败: " << mysql_stmt_error(m_stmt) << std::endl;
        return false;
    }

    return true;
}

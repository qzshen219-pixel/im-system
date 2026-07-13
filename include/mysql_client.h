/**
 * MySQL 客户端
 */

#ifndef MYSQL_CLIENT_H
#define MYSQL_CLIENT_H

#include <string>
#include <memory>
#include <vector>
#include <mysql/mysql.h>

class MysqlClient {
public:
    MysqlClient(const std::string& host, const std::string& user,
                const std::string& password, const std::string& database);
    ~MysqlClient();

    bool connect();
    void disconnect();

    // 执行查询
    bool query(const std::string& sql);
    
    // 获取结果
    std::vector<std::vector<std::string>> getResult();

    // 执行插入并返回 ID
    long long insertId();

    // 预处理语句
    bool prepare(const std::string& sql);
    bool bindParam(int index, const std::string& value);
    bool bindParam(int index, int value);
    bool execute();

private:
    // 确保连接有效
    bool ensureConnection();

    std::string m_host;
    std::string m_user;
    std::string m_password;
    std::string m_database;
    
    MYSQL* m_conn;
    MYSQL_RES* m_result;
    MYSQL_STMT* m_stmt;
};

#endif // MYSQL_CLIENT_H

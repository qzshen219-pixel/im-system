/**
 * 分布式即时通讯服务器 - 主入口
 * 
 * 功能：
 * - WebSocket 实时通信
 * - 用户在线状态管理
 * - 消息转发与持久化
 * - 心跳检测
 */

#include <iostream>
#include <string>
#include <memory>
#include <csignal>

#include "ws_server.h"
#include "http_server.h"
#include "user_manager.h"
#include "message_handler.h"
#include "redis_client.h"
#include "mysql_client.h"

// 全局服务器实例
std::shared_ptr<WsServer> g_wsServer;
std::shared_ptr<HttpServer> g_httpServer;

// 信号处理
void signalHandler(int sig) {
    std::cout << "\n[Server] 收到信号 " << sig << "，正在关闭..." << std::endl;
    if (g_wsServer) {
        g_wsServer->stop();
    }
    if (g_httpServer) {
        g_httpServer->stop();
    }
}

int main(int argc, char* argv[]) {
    // 默认配置
    int port = 8001;
    std::string redis_host = "127.0.0.1";
    int redis_port = 6379;
    std::string mysql_host = "127.0.0.1";
    std::string mysql_user = "root";
    std::string mysql_pass = "";
    std::string mysql_db = "im_database";

    // 解析命令行参数
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "-p" && i + 1 < argc) port = std::stoi(argv[++i]);
        if (arg == "--redis-host" && i + 1 < argc) redis_host = argv[++i];
        if (arg == "--redis-port" && i + 1 < argc) redis_port = std::stoi(argv[++i]);
        if (arg == "--mysql-host" && i + 1 < argc) mysql_host = argv[++i];
        if (arg == "--mysql-user" && i + 1 < argc) mysql_user = argv[++i];
        if (arg == "--mysql-pass" && i + 1 < argc) mysql_pass = argv[++i];
        if (arg == "--mysql-db" && i + 1 < argc) mysql_db = argv[++i];
    }

    std::cout << "========================================" << std::endl;
    std::cout << "  分布式即时通讯服务器 v1.0" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "  端口: " << port << std::endl;
    std::cout << "  Redis: " << redis_host << ":" << redis_port << std::endl;
    std::cout << "  MySQL: " << mysql_host << "/" << mysql_db << std::endl;
    std::cout << "========================================" << std::endl;

    // 注册信号处理
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);

    try {
        // 初始化 Redis 客户端
        auto redis = std::make_shared<RedisClient>(redis_host, redis_port);
        if (!redis->connect()) {
            std::cerr << "[Error] Redis 连接失败" << std::endl;
            return 1;
        }
        std::cout << "[OK] Redis 已连接" << std::endl;

        // 初始化 MySQL 客户端
        auto mysql = std::make_shared<MysqlClient>(mysql_host, mysql_user, mysql_pass, mysql_db);
        if (!mysql->connect()) {
            std::cerr << "[Error] MySQL 连接失败" << std::endl;
            return 1;
        }
        std::cout << "[OK] MySQL 已连接" << std::endl;

        // 初始化用户管理器
        auto userManager = std::make_shared<UserManager>(redis, mysql);

        // 初始化消息处理器
        auto msgHandler = std::make_shared<MessageHandler>(redis, mysql, userManager);

        // 创建 HTTP API 服务器
        g_httpServer = std::make_shared<HttpServer>(8080, userManager, mysql);
        g_httpServer->start();

        // 创建 WebSocket 服务器
        g_wsServer = std::make_shared<WsServer>(port, userManager, msgHandler);
        
        std::cout << "[OK] 服务器启动成功" << std::endl;
        std::cout << "  HTTP API: http://localhost:8080" << std::endl;
        std::cout << "  WebSocket: ws://localhost:" << port << std::endl;
        std::cout << "[Info] 等待客户端连接..." << std::endl;

        // 启动 WebSocket 服务器（阻塞）
        g_wsServer->start();

    } catch (const std::exception& e) {
        std::cerr << "[Error] 服务器异常: " << e.what() << std::endl;
        return 1;
    }

    std::cout << "[Server] 服务器已关闭" << std::endl;
    return 0;
}

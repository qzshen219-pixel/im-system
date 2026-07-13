/**
 * HTTP API 服务器
 * 
 * 处理注册、登录等 HTTP 请求
 */

#ifndef HTTP_SERVER_H
#define HTTP_SERVER_H

#include <string>
#include <memory>
#include <functional>
#include <microhttpd.h>

class UserManager;
class MysqlClient;

class HttpServer {
public:
    HttpServer(int port, std::shared_ptr<UserManager> userManager,
               std::shared_ptr<MysqlClient> mysql);
    ~HttpServer();

    void start();
    void stop();

private:
    static MHD_Result requestHandler(void *cls,
                              struct MHD_Connection *connection,
                              const char *url,
                              const char *method,
                              const char *version,
                              const char *uploadData,
                              size_t *uploadDataSize,
                              void **conCls);

    std::string handleRegister(const std::string& body);
    std::string handleLogin(const std::string& body);
    std::string handleFriends(int userId);
    std::string handleConversations(int userId);
    std::string handleUpload(const std::string& body);
    std::string handleDownload(int fileId, struct MHD_Connection *connection);
    std::string handleFriendAdd(const std::string& body);
    std::string handleFriendAccept(const std::string& body);
    std::string handleFriendRemove(const std::string& body);
    std::string handleFriendPending(int userId);
    std::string handleMessageHistory(int userId, int targetId);
    std::string handleMessageRecall(const std::string& body);
    std::string handleMessageForward(const std::string& body);
    std::string handleMessageReply(const std::string& body);
    std::string handleUserProfile(int userId);
    std::string handleUserUpdate(const std::string& body);
    std::string handleFolderList(int userId);
    std::string handleFolderCreate(const std::string& body);
    std::string handleFolderDelete(const std::string& body);
    std::string handleFileMove(const std::string& body);
    std::string handleFileByFolder(int folderId);
    std::string handleGroupCreate(const std::string& body);
    std::string handleGroupList(int userId);
    std::string handleGroupJoin(const std::string& body);
    std::string handleGroupMembers(int groupId);

    int m_port;
    bool m_running;
    struct MHD_Daemon *m_daemon;
    std::shared_ptr<UserManager> m_userManager;
    std::shared_ptr<MysqlClient> m_mysql;
};

#endif // HTTP_SERVER_H

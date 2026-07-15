/**
 * HTTP API 服务器实现
 */

#include "http_server.h"
#include "user_manager.h"
#include "mysql_client.h"
#include "json/json.h"

#include <iostream>
#include <cstring>

HttpServer::HttpServer(int port, std::shared_ptr<UserManager> userManager,
                       std::shared_ptr<MysqlClient> mysql)
    : m_port(port)
    , m_running(false)
    , m_daemon(nullptr)
    , m_userManager(userManager)
    , m_mysql(mysql)
{
}

HttpServer::~HttpServer()
{
    stop();
}

void HttpServer::start()
{
    m_daemon = MHD_start_daemon(
        MHD_USE_SELECT_INTERNALLY | MHD_USE_DEBUG,
        m_port,
        nullptr, nullptr,
        &HttpServer::requestHandler, this,
        MHD_OPTION_END);

    if (!m_daemon) {
        std::cerr << "[HTTP] 启动失败" << std::endl;
        return;
    }

    m_running = true;
    std::cout << "[HTTP] API 服务器启动，监听端口 " << m_port << std::endl;
}

void HttpServer::stop()
{
    if (m_daemon) {
        MHD_stop_daemon(m_daemon);
        m_daemon = nullptr;
    }
    m_running = false;
}

MHD_Result HttpServer::requestHandler(void *cls,
                               struct MHD_Connection *connection,
                               const char *url,
                               const char *method,
                               const char *version,
                               const char *uploadData,
                               size_t *uploadDataSize,
                               void **conCls)
{
    HttpServer *server = static_cast<HttpServer*>(cls);

    if (*conCls == nullptr) {
        *conCls = new std::string();
        return MHD_YES;
    }

    std::string *body = static_cast<std::string*>(*conCls);

    if (*uploadDataSize > 0) {
        body->append(uploadData, *uploadDataSize);
        *uploadDataSize = 0;
        return MHD_YES;
    }

    std::string response;
    unsigned int status = MHD_HTTP_OK;

    std::string urlStr(url);
    std::string methodStr(method);

    // 处理 CORS 预检请求
    if (methodStr == "OPTIONS") {
        response = "";
        status = MHD_HTTP_OK;
    }
    else if (urlStr == "/api/register" && methodStr == "POST") {
        response = server->handleRegister(*body);
    }
    else if (urlStr == "/api/login" && methodStr == "POST") {
        response = server->handleLogin(*body);
    }
    else if (urlStr == "/api/friends" && methodStr == "GET") {
        const char *userIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "user_id");
        int userId = userIdStr ? std::stoi(userIdStr) : 0;
        response = server->handleFriends(userId);
    }
    else if (urlStr == "/api/conversations" && methodStr == "GET") {
        const char *userIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "user_id");
        int userId = userIdStr ? std::stoi(userIdStr) : 0;
        response = server->handleConversations(userId);
    }
    else if (urlStr.find("/api/upload") == 0 && methodStr == "POST") {
        response = server->handleUpload(*body);
    }
    else if (urlStr.find("/api/download") == 0 && methodStr == "GET") {
        const char *fileIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "file_id");
        int fileId = fileIdStr ? std::stoi(fileIdStr) : 0;
        response = server->handleDownload(fileId, connection);
        status = response.empty() ? MHD_HTTP_NOT_FOUND : MHD_HTTP_OK;
    }
    else if (urlStr == "/api/friend/add" && methodStr == "POST") {
        response = server->handleFriendAdd(*body);
    }
    else if (urlStr == "/api/friend/accept" && methodStr == "POST") {
        response = server->handleFriendAccept(*body);
    }
    else if (urlStr == "/api/friend/remove" && methodStr == "POST") {
        response = server->handleFriendRemove(*body);
    }
    else if (urlStr == "/api/friend/pending" && methodStr == "GET") {
        const char *userIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "user_id");
        int userId = userIdStr ? std::stoi(userIdStr) : 0;
        response = server->handleFriendPending(userId);
    }
    else if (urlStr == "/api/messages/history" && methodStr == "GET") {
        const char *userIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "user_id");
        const char *targetIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "target_id");
        const char *limitStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "limit");
        const char *offsetStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "offset");
        int userId = userIdStr ? std::stoi(userIdStr) : 0;
        int targetId = targetIdStr ? std::stoi(targetIdStr) : 0;
        int limit = limitStr ? std::atoi(limitStr) : 50;
        int offset = offsetStr ? std::atoi(offsetStr) : 0;
        response = server->handleMessageHistory(userId, targetId, limit, offset);
    }
    else if (urlStr == "/api/message/recall" && methodStr == "POST") {
        response = server->handleMessageRecall(*body);
    }
    else if (urlStr == "/api/message/forward" && methodStr == "POST") {
        response = server->handleMessageForward(*body);
    }
    else if (urlStr == "/api/message/reply" && methodStr == "POST") {
        response = server->handleMessageReply(*body);
    }
    else if (urlStr == "/api/message/read" && methodStr == "POST") {
        response = server->handleMessageRead(*body);
    }
    else if (urlStr == "/api/user/profile" && methodStr == "GET") {
        const char *userIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "user_id");
        int userId = userIdStr ? std::stoi(userIdStr) : 0;
        response = server->handleUserProfile(userId);
    }
    else if (urlStr == "/api/user/update" && methodStr == "POST") {
        response = server->handleUserUpdate(*body);
    }
    else if (urlStr == "/api/folder/list" && methodStr == "GET") {
        const char *userIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "user_id");
        int userId = userIdStr ? std::stoi(userIdStr) : 0;
        response = server->handleFolderList(userId);
    }
    else if (urlStr == "/api/folder/create" && methodStr == "POST") {
        response = server->handleFolderCreate(*body);
    }
    else if (urlStr == "/api/folder/delete" && methodStr == "POST") {
        response = server->handleFolderDelete(*body);
    }
    else if (urlStr == "/api/file/move" && methodStr == "POST") {
        response = server->handleFileMove(*body);
    }
    else if (urlStr == "/api/file/by_folder" && methodStr == "GET") {
        const char *folderIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "folder_id");
        int folderId = folderIdStr ? std::stoi(folderIdStr) : 0;
        response = server->handleFileByFolder(folderId);
    }
    else if (urlStr == "/api/health" && methodStr == "GET") {
        response = "{\"status\":\"ok\",\"timestamp\":\"" + std::to_string(std::time(nullptr)) + "\"}";
    }
    else if (urlStr == "/api/group/create" && methodStr == "POST") {
        response = server->handleGroupCreate(*body);
    }
    else if (urlStr == "/api/group/list" && methodStr == "GET") {
        const char *userIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "user_id");
        int userId = userIdStr ? std::stoi(userIdStr) : 0;
        response = server->handleGroupList(userId);
    }
    else if (urlStr == "/api/group/join" && methodStr == "POST") {
        response = server->handleGroupJoin(*body);
    }
    else if (urlStr == "/api/group/members" && methodStr == "GET") {
        const char *groupIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "group_id");
        int groupId = groupIdStr ? std::stoi(groupIdStr) : 0;
        response = server->handleGroupMembers(groupId);
    }
    else if (urlStr == "/api/group/remove" && methodStr == "POST") {
        response = server->handleGroupRemove(*body);
    }
    else if (urlStr == "/api/group/dissolve" && methodStr == "POST") {
        response = server->handleGroupDissolve(*body);
    }
    else if (urlStr == "/api/group/leave" && methodStr == "POST") {
        response = server->handleGroupLeave(*body);
    }
    else if (urlStr == "/api/group/transfer" && methodStr == "POST") {
        response = server->handleGroupTransfer(*body);
    }
    else if (urlStr == "/api/group/messages" && methodStr == "GET") {
        const char *groupIdStr = MHD_lookup_connection_value(connection, MHD_GET_ARGUMENT_KIND, "group_id");
        int groupId = groupIdStr ? std::stoi(groupIdStr) : 0;
        response = server->handleGroupMessages(groupId);
    }
    else {
        status = MHD_HTTP_NOT_FOUND;
        response = "{\"error\":\"Not found\"}";
    }

    delete static_cast<std::string*>(*conCls);
    *conCls = nullptr;

    struct MHD_Response *mhd_response = MHD_create_response_from_buffer(
        response.size(), (void*)response.c_str(), MHD_RESPMEM_MUST_COPY);
    MHD_add_response_header(mhd_response, "Content-Type", "application/json");
    MHD_add_response_header(mhd_response, "Access-Control-Allow-Origin", "*");
    MHD_add_response_header(mhd_response, "Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Id");
    MHD_add_response_header(mhd_response, "Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

    MHD_Result ret = MHD_queue_response(connection, status, mhd_response);
    MHD_destroy_response(mhd_response);

    return ret;
}

std::string HttpServer::handleRegister(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;

    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    std::string username = root["username"].asString();
    std::string password = root["password"].asString();
    std::string nickname = root.get("nickname", "").asString();

    if (username.empty() || password.empty()) {
        return "{\"code\":1,\"message\":\"Username and password required\"}";
    }

    if (m_userManager->registerUser(username, password, nickname)) {
        return "{\"code\":0,\"message\":\"Register success\"}";
    } else {
        return "{\"code\":1,\"message\":\"Username already exists\"}";
    }
}

std::string HttpServer::handleLogin(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;

    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    std::string username = root["username"].asString();
    std::string password = root["password"].asString();

    if (username.empty() || password.empty()) {
        return "{\"code\":1,\"message\":\"Username and password required\"}";
    }

    int userId = 0;
    std::string token = m_userManager->login(username, password, userId);

    if (!token.empty()) {
        Json::Value result;
        result["code"] = 0;
        result["message"] = "Login success";
        result["data"]["id"] = userId;
        result["data"]["username"] = username;
        result["data"]["token"] = token;
        return Json::FastWriter().write(result);
    } else {
        return "{\"code\":1,\"message\":\"Invalid credentials\"}";
    }
}

std::string HttpServer::handleFriends(int userId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;

    // 查询好友关系表中 status='accepted' 的好友
    std::string sql = "SELECT DISTINCT u.id, u.username, u.nickname, u.avatar_id FROM friends f "
        "JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id) "
        "WHERE f.status = 'accepted' AND (f.user_id = " + std::to_string(userId) + " OR f.friend_id = " + std::to_string(userId) + ") "
        "AND u.id != " + std::to_string(userId);
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();

    for (auto& row : rows) {
        Json::Value user;
        user["id"] = std::stoi(row[0]);
        user["username"] = row[1];
        user["nickname"] = row[2];
        user["avatar_id"] = std::stoi(row[3]);
        user["online"] = m_userManager->isOnline(std::stoi(row[0]));
        result["data"].append(user);
    }

    return Json::FastWriter().write(result);
}

std::string HttpServer::handleConversations(int userId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;

    return Json::FastWriter().write(result);
}

std::string HttpServer::handleUpload(const std::string& body)
{
    Json::Value result;
    
    // 解析 JSON 请求
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        result["code"] = 1;
        result["message"] = "Invalid JSON";
        return Json::FastWriter().write(result);
    }
    
    std::string filename = root["filename"].asString();
    std::string fileData = root["file_data"].asString();
    int fromUserId = root["from_user_id"].asInt();
    int toUserId = root["to_user_id"].asInt();
    
    // 保存文件到数据库
    std::string sql = "INSERT INTO files (filename, file_data, from_user_id, to_user_id) VALUES ('"
        + filename + "', '" + fileData + "', " + std::to_string(fromUserId) + ", " + std::to_string(toUserId) + ")";
    
    if (m_mysql->query(sql)) {
        int fileId = m_mysql->insertId();
        result["code"] = 0;
        result["message"] = "Upload success";
        result["data"]["file_id"] = fileId;
        result["data"]["filename"] = filename;
    } else {
        result["code"] = 1;
        result["message"] = "Upload failed";
    }
    
    return Json::FastWriter().write(result);
}

std::string HttpServer::handleDownload(int fileId, struct MHD_Connection *connection)
{
    if (fileId <= 0) return "";
    
    std::string sql = "SELECT filename, file_data FROM files WHERE id = " + std::to_string(fileId);
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();
    
    if (rows.empty()) return "";
    
    // 返回文件信息（实际文件数据在 base64 编码的 file_data 字段中）
    Json::Value result;
    result["code"] = 0;
    result["data"]["file_id"] = fileId;
    result["data"]["filename"] = rows[0][0];
    result["data"]["file_data"] = rows[0][1];
    
    return Json::FastWriter().write(result);
}

std::string HttpServer::handleFriendAdd(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }
    
    int userId = root["user_id"].asInt();
    int friendId = root["friend_id"].asInt();
    
    if (userId <= 0 || friendId <= 0 || userId == friendId) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }
    
    // 检查是否已是好友
    std::string checkSql = "SELECT id FROM friends WHERE user_id=" + std::to_string(userId) + " AND friend_id=" + std::to_string(friendId);
    m_mysql->query(checkSql);
    if (!m_mysql->getResult().empty()) {
        return "{\"code\":1,\"message\":\"Already friends\"}";
    }
    
    // 添加好友请求
    std::string sql = "INSERT INTO friends (user_id, friend_id, status) VALUES (" + std::to_string(userId) + "," + std::to_string(friendId) + ",'pending')";
    if (m_mysql->query(sql)) {
        return "{\"code\":0,\"message\":\"Friend request sent\"}";
    }
    return "{\"code\":1,\"message\":\"Failed to add friend\"}";
}

std::string HttpServer::handleFriendAccept(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }
    
    int userId = root["user_id"].asInt();
    int friendId = root["friend_id"].asInt();
    
    // 更新状态为已接受
    std::string sql = "UPDATE friends SET status='accepted' WHERE user_id=" + std::to_string(friendId) + " AND friend_id=" + std::to_string(userId);
    m_mysql->query(sql);
    
    // 创建双向好友关系
    std::string sql2 = "INSERT IGNORE INTO friends (user_id, friend_id, status) VALUES (" + std::to_string(userId) + "," + std::to_string(friendId) + ",'accepted')";
    m_mysql->query(sql2);
    
    return "{\"code\":0,\"message\":\"Friend request accepted\"}";
}

std::string HttpServer::handleFriendRemove(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }
    
    int userId = root["user_id"].asInt();
    int friendId = root["friend_id"].asInt();
    
    std::string sql = "DELETE FROM friends WHERE (user_id=" + std::to_string(userId) + " AND friend_id=" + std::to_string(friendId) + ") OR (user_id=" + std::to_string(friendId) + " AND friend_id=" + std::to_string(userId) + ")";
    m_mysql->query(sql);
    
    return "{\"code\":0,\"message\":\"Friend removed\"}";
}

std::string HttpServer::handleFriendPending(int userId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;
    
    std::string sql = "SELECT f.user_id, u.username, u.nickname FROM friends f JOIN users u ON f.user_id = u.id WHERE f.friend_id=" + std::to_string(userId) + " AND f.status='pending'";
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();
    
    for (auto& row : rows) {
        Json::Value item;
        item["user_id"] = std::stoi(row[0]);
        item["username"] = row[1];
        item["nickname"] = row[2];
        result["data"].append(item);
    }
    
    return Json::FastWriter().write(result);
}

std::string HttpServer::handleMessageHistory(int userId, int targetId, int limit, int offset)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;

    if (userId <= 0 || targetId <= 0) {
        return Json::FastWriter().write(result);
    }

    if (limit <= 0) limit = 50;
    if (limit > 100) limit = 100;
    if (offset < 0) offset = 0;

    std::string sql = "SELECT id, from_user_id, to_user_id, content, msg_type, created_at, file_id, status FROM messages "
        "WHERE (from_user_id=" + std::to_string(userId) + " AND to_user_id=" + std::to_string(targetId) + ") "
        "OR (from_user_id=" + std::to_string(targetId) + " AND to_user_id=" + std::to_string(userId) + ") "
        "ORDER BY created_at DESC LIMIT " + std::to_string(limit) + " OFFSET " + std::to_string(offset);

    m_mysql->query(sql);
    auto rows = m_mysql->getResult();

    for (auto& row : rows) {
        Json::Value msg;
        msg["id"] = std::stoi(row[0]);
        msg["from"] = std::stoi(row[1]);
        msg["to"] = std::stoi(row[2]);
        msg["content"] = row[3];
        msg["msg_type"] = std::stoi(row[4]);
        msg["time"] = row[5];
        int fileId = std::stoi(row[6]);
        if (fileId > 0) {
            msg["file_id"] = fileId;
        }
        msg["status"] = std::stoi(row[7]);

        std::string fromName;
        m_userManager->getUserInfo(msg["from"].asInt(), fromName, fromName);
        msg["from_name"] = fromName;

        result["data"].append(msg);
    }

    return Json::FastWriter().write(result);
}

std::string HttpServer::handleMessageRecall(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int messageId = root["message_id"].asInt();
    int userId = root["user_id"].asInt();

    if (messageId <= 0 || userId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 验证消息是否属于该用户，并检查时间
    std::string checkSql = "SELECT from_user_id, created_at FROM messages WHERE id=" + std::to_string(messageId);
    m_mysql->query(checkSql);
    auto rows = m_mysql->getResult();

    if (rows.empty()) {
        return "{\"code\":1,\"message\":\"消息不存在\"}";
    }

    int fromUserId = std::stoi(rows[0][0]);
    if (fromUserId != userId) {
        return "{\"code\":1,\"message\":\"只能撤回自己的消息\"}";
    }

    // 检查消息时间是否在2分钟内
    std::string createTime = rows[0][1];
    std::string sql = "SELECT TIMESTAMPDIFF(SECOND, '" + createTime + "', NOW())";
    m_mysql->query(sql);
    auto timeRows = m_mysql->getResult();
    int secondsDiff = std::stoi(timeRows[0][0]);

    if (secondsDiff > 120) {
        return "{\"code\":1,\"message\":\"消息发送超过2分钟，无法撤回\"}";
    }

    // 更新消息内容为已撤回
    std::string updateSql = "UPDATE messages SET content='[消息已撤回]', msg_type=4 WHERE id=" + std::to_string(messageId);
    m_mysql->query(updateSql);

    return "{\"code\":0,\"message\":\"消息已撤回\"}";
}

std::string HttpServer::handleMessageForward(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int msgId = root["msg_id"].asInt();
    int toUserId = root["to_user_id"].asInt();
    int fromUserId = root["from_user_id"].asInt();

    if (msgId <= 0 || toUserId <= 0 || fromUserId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 获取原消息内容
    std::string sql = "SELECT content, msg_type FROM messages WHERE id=" + std::to_string(msgId);
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();
    if (rows.empty()) {
        return "{\"code\":1,\"message\":\"消息不存在\"}";
    }

    std::string content = "[转发] " + rows[0][0];
    int msgType = std::stoi(rows[0][1]);

    // 插入新消息
    std::string insertSql = "INSERT INTO messages (from_user_id, to_user_id, content, msg_type) VALUES ("
        + std::to_string(fromUserId) + ", " + std::to_string(toUserId) + ", '" + content + "', " + std::to_string(msgType) + ")";
    m_mysql->query(insertSql);
    int newMsgId = m_mysql->insertId();

    Json::Value result;
    result["code"] = 0;
    result["data"]["msg_id"] = newMsgId;
    return Json::FastWriter().write(result);
}

std::string HttpServer::handleMessageReply(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int replyToMsgId = root["reply_to_msg_id"].asInt();
    int fromUserId = root["from_user_id"].asInt();
    int toUserId = root["to_user_id"].asInt();
    std::string content = root["content"].asString();

    if (replyToMsgId <= 0 || fromUserId <= 0 || toUserId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 获取原消息内容
    std::string sql = "SELECT content FROM messages WHERE id=" + std::to_string(replyToMsgId);
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();
    if (rows.empty()) {
        return "{\"code\":1,\"message\":\"原消息不存在\"}";
    }

    std::string originalContent = rows[0][0];
    // 截取前50个字符
    if (originalContent.length() > 50) {
        originalContent = originalContent.substr(0, 50) + "...";
    }

    // 构建回复消息内容
    std::string replyContent = "[回复: " + originalContent + "] " + content;

    // 插入新消息
    std::string insertSql = "INSERT INTO messages (from_user_id, to_user_id, content, msg_type) VALUES ("
        + std::to_string(fromUserId) + ", " + std::to_string(toUserId) + ", '" + replyContent + "', 1)";
    m_mysql->query(insertSql);
    int newMsgId = m_mysql->insertId();

    Json::Value result;
    result["code"] = 0;
    result["data"]["msg_id"] = newMsgId;
    return Json::FastWriter().write(result);
}

std::string HttpServer::handleMessageRead(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int userId = root["user_id"].asInt();
    int fromUserId = root["from_user_id"].asInt();

    if (userId <= 0 || fromUserId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 标记该用户收到的来自 fromUserId 的所有消息为已读
    std::string sql = "UPDATE messages SET status=1 WHERE from_user_id=" + std::to_string(fromUserId)
        + " AND to_user_id=" + std::to_string(userId) + " AND status=0";
    m_mysql->query(sql);

    return "{\"code\":0,\"message\":\"Messages marked as read\"}";
}

std::string HttpServer::handleUserProfile(int userId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::objectValue;

    std::string sql = "SELECT id, username, nickname, email, phone, created_at, avatar_id FROM users WHERE id=" + std::to_string(userId);
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();

    if (rows.empty()) {
        result["code"] = 1;
        result["message"] = "User not found";
    } else {
        result["data"]["id"] = std::stoi(rows[0][0]);
        result["data"]["username"] = rows[0][1];
        result["data"]["nickname"] = rows[0][2];
        result["data"]["email"] = rows[0][3];
        result["data"]["phone"] = rows[0][4];
        result["data"]["created_at"] = rows[0][5];
        result["data"]["avatar_id"] = std::stoi(rows[0][6]);
    }

    return Json::FastWriter().write(result);
}

std::string HttpServer::handleUserUpdate(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }
    
    int userId = root["user_id"].asInt();
    if (userId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid user_id\"}";
    }
    
    std::string sql = "UPDATE users SET ";
    std::vector<std::string> updates;
    
    if (root.isMember("nickname")) {
        updates.push_back("nickname='" + root["nickname"].asString() + "'");
    }
    if (root.isMember("email")) {
        updates.push_back("email='" + root["email"].asString() + "'");
    }
    if (root.isMember("phone")) {
        updates.push_back("phone='" + root["phone"].asString() + "'");
    }
    if (root.isMember("avatar_id")) {
        updates.push_back("avatar_id=" + std::to_string(root["avatar_id"].asInt()));
    }
    
    if (updates.empty()) {
        return "{\"code\":1,\"message\":\"No fields to update\"}";
    }
    
    sql += updates[0];
    for (size_t i = 1; i < updates.size(); i++) {
        sql += ", " + updates[i];
    }
    sql += " WHERE id=" + std::to_string(userId);
    
    m_mysql->query(sql);
    
    return "{\"code\":0,\"message\":\"Profile updated\"}";
}

std::string HttpServer::handleFolderList(int userId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;
    
    std::string sql = "SELECT id, name, created_at FROM folders WHERE user_id=" + std::to_string(userId) + " ORDER BY created_at DESC";
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();
    
    for (auto& row : rows) {
        Json::Value folder;
        folder["id"] = std::stoi(row[0]);
        folder["name"] = row[1];
        folder["created_at"] = row[2];
        result["data"].append(folder);
    }
    
    return Json::FastWriter().write(result);
}

std::string HttpServer::handleFolderCreate(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }
    
    int userId = root["user_id"].asInt();
    std::string name = root["name"].asString();
    
    if (userId <= 0 || name.empty()) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }
    
    std::string sql = "INSERT INTO folders (user_id, name) VALUES (" + std::to_string(userId) + ",'" + name + "')";
    if (m_mysql->query(sql)) {
        int folderId = m_mysql->insertId();
        return "{\"code\":0,\"data\":{\"id\":" + std::to_string(folderId) + ",\"name\":\"" + name + "\"}}";
    }
    return "{\"code\":1,\"message\":\"Failed to create folder\"}";
}

std::string HttpServer::handleFolderDelete(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }
    
    int folderId = root["folder_id"].asInt();
    int userId = root["user_id"].asInt();
    
    if (folderId <= 0 || userId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }
    
    std::string sql = "DELETE FROM folders WHERE id=" + std::to_string(folderId) + " AND user_id=" + std::to_string(userId);
    m_mysql->query(sql);
    
    return "{\"code\":0,\"message\":\"Folder deleted\"}";
}

std::string HttpServer::handleFileMove(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }
    
    int fileId = root["file_id"].asInt();
    int folderId = root["folder_id"].asInt();
    
    if (fileId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid file_id\"}";
    }
    
    std::string sql = "UPDATE files SET folder_id=" + std::to_string(folderId) + " WHERE id=" + std::to_string(fileId);
    m_mysql->query(sql);
    
    return "{\"code\":0,\"message\":\"File moved\"}";
}

std::string HttpServer::handleFileByFolder(int folderId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;
    
    std::string sql;
    if (folderId == 0) {
        sql = "SELECT id, filename, LENGTH(file_data), created_at FROM files WHERE folder_id=0 ORDER BY created_at DESC";
    } else {
        sql = "SELECT id, filename, LENGTH(file_data), created_at FROM files WHERE folder_id=" + std::to_string(folderId) + " ORDER BY created_at DESC";
    }
    
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();
    
    for (auto& row : rows) {
        Json::Value file;
        file["id"] = std::stoi(row[0]);
        file["filename"] = row[1];
        file["size"] = std::stoi(row[2]);
        file["time"] = row[3];
        result["data"].append(file);
    }

    return Json::FastWriter().write(result);
}

// ==================== 群组管理 ====================
std::string HttpServer::handleGroupCreate(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int userId = root["user_id"].asInt();
    std::string name = root["name"].asString();

    if (userId <= 0 || name.empty()) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    std::string sql = "INSERT INTO groups_table (name, owner_id) VALUES ('" + name + "', " + std::to_string(userId) + ")";
    m_mysql->query(sql);
    int groupId = m_mysql->insertId();

    // 创建者自动加入群组
    std::string memberSql = "INSERT INTO group_members (group_id, user_id, role) VALUES ("
        + std::to_string(groupId) + ", " + std::to_string(userId) + ", 1)";
    m_mysql->query(memberSql);

    Json::Value result;
    result["code"] = 0;
    result["data"]["id"] = groupId;
    result["data"]["name"] = name;
    return Json::FastWriter().write(result);
}

std::string HttpServer::handleGroupList(int userId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;

    if (userId <= 0) {
        return Json::FastWriter().write(result);
    }

    std::string sql = "SELECT g.id, g.name, g.owner_id FROM groups_table g "
        "JOIN group_members gm ON g.id = gm.group_id "
        "WHERE gm.user_id = " + std::to_string(userId);
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();

    for (auto& row : rows) {
        Json::Value group;
        group["id"] = std::stoi(row[0]);
        group["name"] = row[1];
        group["owner_id"] = std::stoi(row[2]);
        result["data"].append(group);
    }

    return Json::FastWriter().write(result);
}

std::string HttpServer::handleGroupJoin(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int userId = root["user_id"].asInt();
    int groupId = root["group_id"].asInt();

    if (userId <= 0 || groupId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 检查群组是否存在
    std::string checkSql = "SELECT id FROM groups_table WHERE id=" + std::to_string(groupId);
    m_mysql->query(checkSql);
    auto checkRows = m_mysql->getResult();
    if (checkRows.empty()) {
        return "{\"code\":1,\"message\":\"群组不存在\"}";
    }

    // 检查是否已经是成员
    std::string memberCheckSql = "SELECT user_id FROM group_members WHERE group_id=" + std::to_string(groupId) + " AND user_id=" + std::to_string(userId);
    m_mysql->query(memberCheckSql);
    auto memberRows = m_mysql->getResult();
    if (!memberRows.empty()) {
        return "{\"code\":1,\"message\":\"已经是群组成员\"}";
    }

    // 加入群组
    std::string sql = "INSERT INTO group_members (group_id, user_id, role) VALUES ("
        + std::to_string(groupId) + ", " + std::to_string(userId) + ", 0)";
    m_mysql->query(sql);

    return "{\"code\":0,\"message\":\"加入群组成功\"}";
}

std::string HttpServer::handleGroupMembers(int groupId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;

    if (groupId <= 0) {
        return Json::FastWriter().write(result);
    }

    std::string sql = "SELECT u.id, u.username, u.nickname, gm.role FROM group_members gm "
        "JOIN users u ON gm.user_id = u.id "
        "WHERE gm.group_id = " + std::to_string(groupId);
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();

    for (auto& row : rows) {
        Json::Value member;
        member["id"] = std::stoi(row[0]);
        member["username"] = row[1];
        member["nickname"] = row[2];
        member["role"] = std::stoi(row[3]);
        member["online"] = m_userManager->isOnline(std::stoi(row[0]));
        result["data"].append(member);
    }

    return Json::FastWriter().write(result);
}

std::string HttpServer::handleGroupRemove(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int groupId = root["group_id"].asInt();
    int userId = root["user_id"].asInt();
    int operatorId = root["operator_id"].asInt();

    if (groupId <= 0 || userId <= 0 || operatorId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 检查操作者是否是群主
    std::string checkSql = "SELECT role FROM group_members WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(operatorId);
    m_mysql->query(checkSql);
    auto checkRows = m_mysql->getResult();
    if (checkRows.empty() || std::stoi(checkRows[0][0]) != 1) {
        return "{\"code\":1,\"message\":\"只有群主可以删除成员\"}";
    }

    // 不能删除自己
    if (userId == operatorId) {
        return "{\"code\":1,\"message\":\"不能删除自己\"}";
    }

    // 删除成员
    std::string sql = "DELETE FROM group_members WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(userId);
    m_mysql->query(sql);

    return "{\"code\":0,\"message\":\"成员已删除\"}";
}

std::string HttpServer::handleGroupDissolve(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int groupId = root["group_id"].asInt();
    int userId = root["user_id"].asInt();

    if (groupId <= 0 || userId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 检查是否是群主
    std::string checkSql = "SELECT role FROM group_members WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(userId);
    m_mysql->query(checkSql);
    auto checkRows = m_mysql->getResult();
    if (checkRows.empty() || std::stoi(checkRows[0][0]) != 1) {
        return "{\"code\":1,\"message\":\"只有群主可以解散群组\"}";
    }

    // 删除所有成员
    m_mysql->query("DELETE FROM group_members WHERE group_id=" + std::to_string(groupId));
    // 删除群组
    m_mysql->query("DELETE FROM groups_table WHERE id=" + std::to_string(groupId));

    return "{\"code\":0,\"message\":\"群组已解散\"}";
}

std::string HttpServer::handleGroupLeave(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int groupId = root["group_id"].asInt();
    int userId = root["user_id"].asInt();

    if (groupId <= 0 || userId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 检查是否是群主（群主不能退出）
    std::string checkSql = "SELECT role FROM group_members WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(userId);
    m_mysql->query(checkSql);
    auto checkRows = m_mysql->getResult();
    if (checkRows.empty()) {
        return "{\"code\":1,\"message\":\"你不是群组成员\"}";
    }
    if (std::stoi(checkRows[0][0]) == 1) {
        return "{\"code\":1,\"message\":\"群主不能退出群组，请先解散或转让群组\"}";
    }

    // 删除成员
    m_mysql->query("DELETE FROM group_members WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(userId));

    return "{\"code\":0,\"message\":\"已退出群组\"}";
}

std::string HttpServer::handleGroupTransfer(const std::string& body)
{
    Json::Value root;
    Json::Reader reader;
    if (!reader.parse(body, root)) {
        return "{\"code\":1,\"message\":\"Invalid JSON\"}";
    }

    int groupId = root["group_id"].asInt();
    int fromUserId = root["from_user_id"].asInt();
    int toUserId = root["to_user_id"].asInt();

    if (groupId <= 0 || fromUserId <= 0 || toUserId <= 0) {
        return "{\"code\":1,\"message\":\"Invalid parameters\"}";
    }

    // 检查操作者是否是群主
    std::string checkSql = "SELECT role FROM group_members WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(fromUserId);
    m_mysql->query(checkSql);
    auto checkRows = m_mysql->getResult();
    if (checkRows.empty() || std::stoi(checkRows[0][0]) != 1) {
        return "{\"code\":1,\"message\":\"只有群主可以转让群组\"}";
    }

    // 检查目标用户是否是群成员
    std::string memberCheckSql = "SELECT user_id FROM group_members WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(toUserId);
    m_mysql->query(memberCheckSql);
    auto memberRows = m_mysql->getResult();
    if (memberRows.empty()) {
        return "{\"code\":1,\"message\":\"目标用户不是群组成员\"}";
    }

    // 转让群组
    m_mysql->query("UPDATE group_members SET role=0 WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(fromUserId));
    m_mysql->query("UPDATE group_members SET role=1 WHERE group_id=" + std::to_string(groupId)
        + " AND user_id=" + std::to_string(toUserId));

    return "{\"code\":0,\"message\":\"群组已转让\"}";
}

std::string HttpServer::handleGroupMessages(int groupId)
{
    Json::Value result;
    result["code"] = 0;
    result["data"] = Json::arrayValue;

    if (groupId <= 0) {
        return Json::FastWriter().write(result);
    }

    // 群组消息存储在 messages 表中，使用 group_id 字段
    std::string sql = "SELECT m.id, m.from_user_id, m.content, m.msg_type, m.created_at, u.username, u.nickname, m.file_id "
        "FROM messages m JOIN users u ON m.from_user_id = u.id "
        "WHERE m.group_id = " + std::to_string(groupId) + " "
        "ORDER BY m.created_at ASC LIMIT 200";
    m_mysql->query(sql);
    auto rows = m_mysql->getResult();

    for (auto& row : rows) {
        Json::Value msg;
        msg["id"] = std::stoi(row[0]);
        msg["from"] = std::stoi(row[1]);
        msg["content"] = row[2];
        msg["msg_type"] = std::stoi(row[3]);
        msg["time"] = row[4];
        msg["from_name"] = row[6].empty() ? row[5] : row[6];
        int fileId = std::stoi(row[7]);
        if (fileId > 0) {
            msg["file_id"] = fileId;
        }
        result["data"].append(msg);
    }

    return Json::FastWriter().write(result);
}

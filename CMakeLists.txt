cmake_minimum_required(VERSION 3.14)
project(im-server VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 查找依赖包
find_package(OpenSSL REQUIRED)
find_package(PkgConfig REQUIRED)
find_package(Threads REQUIRED)

# 查找 WebSocket++ (header-only)
find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/version.hpp)

# 查找 JsonCpp
pkg_check_modules(JSONCPP jsoncpp REQUIRED)

# 查找 hiredis (Redis C client)
find_library(HIREDIS_LIB hiredis PATHS /usr/lib/x86_64-linux-gnu REQUIRED)
find_path(HIREDIS_INCLUDE_DIR hiredis/hiredis.h REQUIRED)

# 查找 libevent via pkg-config
pkg_check_modules(LIBEVENT REQUIRED libevent)

# 查找 MySQL via pkg-config
pkg_check_modules(MYSQL REQUIRED mysqlclient)

# 查找 libmicrohttpd
find_library(MHD_LIB microhttpd REQUIRED)
find_path(MHD_INCLUDE_DIR microhttpd.h REQUIRED)

# 包含目录
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${OPENSSL_INCLUDE_DIR}
    ${WEBSOCKETPP_INCLUDE_DIR}
    ${JSONCPP_INCLUDE_DIRS}
    ${HIREDIS_INCLUDE_DIR}
    ${LIBEVENT_INCLUDE_DIRS}
    ${MYSQL_INCLUDE_DIRS}
    ${MHD_INCLUDE_DIR}
)

# 源文件
file(GLOB SOURCES "src/*.cpp")

# 可执行文件
add_executable(im-server ${SOURCES})

# 链接库
target_link_libraries(im-server
    ${OPENSSL_LIBRARIES}
    ${JSONCPP_LIBRARIES}
    ${HIREDIS_LIB}
    ${LIBEVENT_LIBRARIES}
    ${MYSQL_LIBRARIES}
    ${MHD_LIB}
    Threads::Threads
    ssl
    crypto
)

# 安装规则
install(TARGETS im-server DESTINATION bin)
install(DIRECTORY web/ DESTINATION share/im-server/web)

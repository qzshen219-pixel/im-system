#!/usr/bin/env python3
import http.server
import socketserver
import os

os.chdir('/mnt/e/distributed-cloud-disk/im-system/web')
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(('0.0.0.0', 8081), Handler) as httpd:
    print('Serving at port 8081')
    httpd.serve_forever()

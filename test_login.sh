#!/bin/bash
curl -s http://172.22.120.246:8080/api/login -X POST -H "Content-Type: application/json" -d '{"username":"test1","password":"123456"}'

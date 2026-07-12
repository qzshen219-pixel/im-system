#!/bin/bash
mysql -u im_user -p'im_pass' im_database -e "SELECT id, username, password_hash FROM users WHERE username='salt_test'"

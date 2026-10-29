#!/bin/sh
# 容器入口：先把迁移跑到最新，再启动 uvicorn。
# 迁移失败就退出（容器不会带着半旧 schema 提供服务）。
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] alembic upgrade head"
  alembic upgrade head
fi

exec "$@"

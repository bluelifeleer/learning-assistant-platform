"""重置某个账号的登录密码(忘记密码 / 密码无法登录时使用)。

用法(在 apps/api 目录下执行):

    # 随机生成一个强密码并直接写入,终端会打印新密码
    .\\.venv\\Scripts\\python -m scripts.reset_password --account thebulelife@163.com --generate

    # 指定新密码(也可以用 --password 直接传)
    .\\.venv\\Scripts\\python -m scripts.reset_password --account thebulelife@163.com

    # 只改密码,不动已登录的会话
    .\\.venv\\Scripts\\python -m scripts.reset_password --account thebulelife@163.com --generate --keep-sessions

脚本会:
1. 按邮箱或用户名找到账号(email 不区分大小写);
2. 用和 API 完全一致的 PBKDF2 逻辑写入新密码哈希;
3. 默认吊销该账号所有控制台会话 token(下次需重新登录);
4. 打印新密码并自检一次,确认登录可用。
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
from getpass import getpass
import secrets
import string
import sys

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entities import ApiToken, User
from app.services.auth import hash_password, verify_password

# 去掉容易混淆的字符(I/l/1、O/0),方便手抄
LETTERS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
DIGITS = "23456789"
SYMBOLS = "!@#$%^&*-_=+"
PASSWORD_LENGTH = 16


def generate_password(length: int = PASSWORD_LENGTH) -> str:
    pool = LETTERS + DIGITS + SYMBOLS
    while True:
        candidate = "".join(secrets.choice(pool) for _ in range(length))
        if (
            any(c in LETTERS for c in candidate)
            and any(c in DIGITS for c in candidate)
            and any(c in SYMBOLS for c in candidate)
        ):
            return candidate


def find_user(db: Session, account: str) -> User | None:
    key = account.strip().lower()
    return db.execute(
        select(User).where(or_(User.email == key, User.username == key))
    ).scalar_one_or_none()


def revoke_sessions(db: Session, user: User) -> int:
    now = datetime.now(UTC)
    tokens = db.execute(
        select(ApiToken).where(
            ApiToken.user_id == user.id,
            ApiToken.revoked_at.is_(None),
        )
    ).scalars().all()
    for token in tokens:
        token.revoked_at = now
    return len(tokens)


def main(argv: list[str] | None = None) -> int:
    # 终端编码不一致时(中文 Windows 默认 GBK)尽量保证中文输出不乱码
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, OSError):
            pass

    parser = argparse.ArgumentParser(description="重置学习助手账号的登录密码")
    parser.add_argument("--account", required=True, help="邮箱或用户名")
    parser.add_argument("--password", help="新密码(6 位以上);不传则交互输入")
    parser.add_argument("--generate", action="store_true", help="随机生成强密码")
    parser.add_argument("--keep-sessions", action="store_true", help="保留该账号已登录的会话")
    args = parser.parse_args(argv)

    if args.generate and args.password:
        parser.error("--generate 和 --password 只能二选一")

    new_password = args.password
    if args.generate:
        new_password = generate_password()
    elif new_password is None:
        new_password = getpass("请输入新密码(至少 6 位): ")
        confirm = getpass("请再输入一次: ")
        if new_password != confirm:
            print("两次输入不一致,已取消。", file=sys.stderr)
            return 1

    if len(new_password) < 6:
        print("新密码至少需要 6 位。", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        user = find_user(db, args.account)
        if user is None:
            print(f"找不到账号: {args.account}", file=sys.stderr)
            return 2

        new_hash = hash_password(new_password)
        if not verify_password(new_password, new_hash):
            print("哈希自检失败,未写入。", file=sys.stderr)
            return 3

        user.password_hash = new_hash
        revoked = 0 if args.keep_sessions else revoke_sessions(db, user)
        # commit 后 ORM 对象会过期,先把要打印的信息拿出来,避免会话关闭后取属性报 DetachedInstanceError
        email = user.email
        username = user.username
        db.commit()

    print(f"账号        : {email}" + (f" (用户名 {username})" if username else ""))
    print(f"新密码      : {new_password}")
    print(f"吊销会话数  : {revoked}" + ("(已保留)" if args.keep_sessions else ""))
    print("登录地址    : http://127.0.0.1:17891")
    print("登录后可在 系统设置 → 用户 → 修改密码 里换成自己的密码。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

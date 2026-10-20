"""查看控制台账号 / 重置登录密码。

登录只认 **邮箱** 或 **username**,不认显示名称(display_name)。
忘记用哪个账号登录时,先用 --list 看一遍。

    python -m scripts.set_password --list
    python -m scripts.set_password --account thebulelife@163.com
    python -m scripts.set_password --account thebulelife@163.com --generate

--generate 会生成一个随机临时密码并打印出来,登录后请到「用户与授权」里改掉。
"""

from __future__ import annotations

import argparse
import getpass
import secrets
import sys

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.entities import User
from app.services.auth import hash_password


def find_user(db, account: str) -> User | None:
    """与 AuthService.login 完全一致的查找顺序:先精确邮箱,再 username。"""
    needle = account.strip().lower()
    user = db.scalar(select(User).where(User.email == needle))
    if user is None:
        user = db.scalar(select(User).where(User.username == needle))
    return user


def list_users(db) -> None:
    users = list(db.scalars(select(User).order_by(User.created_at)).all())
    print(f"共 {len(users)} 个账号:\n")
    for user in users:
        print(f"  email        = {user.email}")
        print(f"  username     = {user.username!r}")
        print(f"  display_name = {user.display_name!r}   ← 不能用来登录")
        print(f"  created      = {user.created_at}")
        print()
    if not users:
        print("  (没有账号,需要先跑安装向导)")


def read_password() -> str:
    if not sys.stdin.isatty():
        print("非交互环境无法安全输入密码,请改用 --generate", file=sys.stderr)
        raise SystemExit(2)
    first = getpass.getpass("新密码: ")
    if len(first) < 6:
        print("密码至少 6 位", file=sys.stderr)
        raise SystemExit(2)
    if getpass.getpass("再输一次: ") != first:
        print("两次输入不一致", file=sys.stderr)
        raise SystemExit(2)
    return first


def main() -> int:
    parser = argparse.ArgumentParser(description="查看账号或重置控制台登录密码")
    parser.add_argument("--list", action="store_true", help="列出所有账号")
    parser.add_argument("--account", help="邮箱或 username")
    parser.add_argument("--generate", action="store_true", help="生成随机临时密码")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.list or not args.account:
            list_users(db)
            if not args.account:
                print("重置密码示例:python -m scripts.set_password --account <邮箱> --generate")
            return 0

        user = find_user(db, args.account)
        if user is None:
            print(f"找不到账号 {args.account!r};可先用 --list 查看现有账号", file=sys.stderr)
            return 1

        new_password = secrets.token_urlsafe(9) if args.generate else read_password()
        user.password_hash = hash_password(new_password)
        db.commit()
        print(f"已重置 {user.email} 的登录密码。")
        if args.generate:
            print(f"临时密码:{new_password}")
            print("登录后请到「用户与授权」里改掉它。")
        print("提示:若刚才连续登录失败多次,限流会锁定 5 分钟,稍等再试。")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())

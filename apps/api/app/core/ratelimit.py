"""极简的进程内滑动窗口限流器,用于登录/注册接口的暴力破解防护。

单进程本地部署下够用;多 worker 部署需要替换为共享存储(如 Redis)。
"""

from collections import defaultdict, deque
import threading
import time


class SlidingWindowLimiter:
    def __init__(self, max_attempts: int, window_seconds: float) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """记录一次尝试;窗口内超过上限返回 False。"""
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets[key]
            while bucket and now - bucket[0] > self.window_seconds:
                bucket.popleft()
            if len(bucket) >= self.max_attempts:
                return False
            bucket.append(now)
            return True

    def reset(self, key: str) -> None:
        """成功时清除计数,避免正常用户被误伤。"""
        with self._lock:
            self._buckets.pop(key, None)


# 每个账号+来源 IP 在 5 分钟内最多尝试 10 次(登录失败计入,成功即重置)
login_limiter = SlidingWindowLimiter(max_attempts=10, window_seconds=300)
register_limiter = SlidingWindowLimiter(max_attempts=10, window_seconds=300)

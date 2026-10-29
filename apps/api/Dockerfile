FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 依赖都是 wheel（psycopg[binary] 自带 libpq），不需要编译工具链
COPY apps/api/pyproject.toml ./
COPY apps/api/app ./app
COPY apps/api/alembic ./alembic
COPY apps/api/alembic.ini ./
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN pip install . \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && useradd --create-home --uid 10001 appuser \
 && mkdir -p /data/exports /data/screenshots /data/note_images \
 && chown -R appuser:appuser /app /data

USER appuser

# 三个媒体目录挂到卷上，重建容器不丢文件
ENV EXPORT_DIR=/data/exports \
    SCREENSHOTS_DIR=/data/screenshots \
    NOTE_IMAGES_DIR=/data/note_images \
    API_HOST=0.0.0.0 \
    API_PORT=17890

EXPOSE 17890

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:17890/api/v1/health', timeout=3)"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "17890", "--proxy-headers", "--forwarded-allow-ips", "*"]

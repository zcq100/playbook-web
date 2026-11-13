FROM python:3.13-slim-bookworm

ARG APP_VERSION=0.1.1
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Playbook UI" \
      org.opencontainers.image.description="Local Ansible repository workbench" \
      org.opencontainers.image.source="https://github.com/zcq100/playbook-web" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYBOOK_SETTINGS_FILE=/data/.settings.json \
    ANSIBLE_LOCAL_TEMP=/tmp/ansible-local

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssh-client git \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 app \
    && useradd --uid 1000 --gid app --create-home app \
    && mkdir -p /app /data /workspace \
    && chown app:app /app /data /workspace

WORKDIR /app
COPY requirements.txt requirements-container.txt ./
RUN python -m pip install --no-cache-dir -r requirements-container.txt
COPY --chown=app:app server.py assets.py workspaces.py VERSION ./
COPY --chown=app:app static/ ./static/
COPY --chown=app:app examples/ ./examples/

USER app
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=3).read()"]
ENTRYPOINT ["python", "server.py"]
CMD ["--host", "0.0.0.0", "--port", "8765"]
